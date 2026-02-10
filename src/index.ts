#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosRequestConfig } from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiSpecPath = path.join(__dirname, "..", "centia-api.json");
const apiSpec = JSON.parse(fs.readFileSync(apiSpecPath, "utf-8"));

const API_BASE_URL = process.env.API_BASE_URL || "https://api.centia.io";
const API_TOKEN = process.env.API_TOKEN;

const server = new Server(
  {
    name: "centia-io-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function resolveSchema(schema: any): any {
  if (!schema) return { type: "string" };
  if (schema.$ref) {
    const refPath = schema.$ref.replace("#/", "").split("/");
    let current = apiSpec;
    for (const segment of refPath) {
      if (!current[segment]) {
        console.error(`Could not resolve ref: ${schema.$ref}`);
        return { type: "string" };
      }
      current = current[segment];
    }
    return resolveSchema(current);
  }
  if (schema.allOf) {
    let merged: any = { type: "object", properties: {}, required: [] };
    for (const s of schema.allOf) {
      const resolved = resolveSchema(s);
      if (resolved.properties) {
        merged.properties = { ...merged.properties, ...resolved.properties };
      }
      if (resolved.required) {
        merged.required = [...new Set([...merged.required, ...resolved.required])];
      }
    }
    return merged;
  }
  if (schema.type === "object" && schema.properties) {
    const properties: any = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = resolveSchema(value);
    }
    return { ...schema, properties };
  }
  if (schema.type === "array" && schema.items) {
    return { ...schema, items: resolveSchema(schema.items) };
  }
  return schema;
}

// Sanitize JSON Schemas for MCP tool input to avoid oversized numeric literals
function sanitizeSchemaForMCP(schema: any): any {
  if (schema == null) return schema;
  if (Array.isArray(schema)) {
    return schema.map((s) => sanitizeSchemaForMCP(s));
  }
  if (typeof schema !== "object") return schema;

  const clone: any = { ...schema };

  const numericKeys = [
    "example",
    "default",
    "maximum",
    "minimum",
    "exclusiveMaximum",
    "exclusiveMinimum",
    "multipleOf",
    "const",
  ];

  for (const key of numericKeys) {
    if (clone[key] !== undefined && typeof clone[key] === "number") {
      if (!Number.isFinite(clone[key]) || Math.abs(clone[key]) > Number.MAX_SAFE_INTEGER) {
        delete clone[key];
      }
    }
  }

  // Drop non‑standard/annotation keywords that some validators reject
  for (const k of ["example", "examples", "deprecated", "readOnly", "writeOnly", "xml", "style", "explode", "nullable"]) {
    if (k in clone) delete clone[k];
  }

  if (Array.isArray(clone.enum)) {
    clone.enum = clone.enum.filter(
      (v: any) => !(typeof v === "number" && (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER))
    );
    if (clone.enum.length === 0) delete clone.enum;
  }

  if (clone.properties && typeof clone.properties === "object") {
    const newProps: any = {};
    for (const [k, v] of Object.entries(clone.properties)) {
      newProps[k] = sanitizeSchemaForMCP(v);
    }
    clone.properties = newProps;
  }

  if (clone.items) {
    clone.items = sanitizeSchemaForMCP(clone.items);
  }

  for (const k of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray((clone as any)[k])) {
      (clone as any)[k] = (clone as any)[k].map((s: any) => sanitizeSchemaForMCP(s));
    }
  }

  return clone;
}

// Normalize a schema to a conservative JSON Schema 2020-12 subset accepted by most MCP clients
function normalizeJsonSchemaForMCP(schema: any): any {
  if (schema == null) return undefined;
  if (Array.isArray(schema)) return schema.map((s) => normalizeJsonSchemaForMCP(s));
  if (typeof schema !== "object") return schema;

  const allowedKeys = new Set([
    "type",
    "properties",
    "required",
    "description",
    "enum",
    "items",
    "anyOf",
    "oneOf",
    "allOf",
    "const",
    "default",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "minItems",
    "maxItems",
    "uniqueItems",
    "contains",
    "additionalProperties",
    "patternProperties",
    "title",
  ]);

  const formatWhitelist = new Set([
    "email",
    "uri",
    "uuid",
    "ipv4",
    "ipv6",
    "date-time",
    "date",
    "time",
  ]);

  const result: any = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!allowedKeys.has(k)) continue; // drop unknown keys
    result[k] = v;
  }

  // Ensure type validity or provide a safe default
  const validTypes = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);
  if (result.type !== undefined) {
    if (Array.isArray(result.type)) {
      const filtered = result.type.filter((t: any) => validTypes.has(t));
      if (filtered.length > 0) result.type = filtered;
      else delete result.type;
    } else if (!validTypes.has(result.type)) {
      delete result.type;
    }
  }

  // Prune/normalize format
  if (typeof result.format === "string" && !formatWhitelist.has(result.format)) {
    delete result.format; // remove non-standard formats like 'url' or 'binary'
  }

  // Normalize required
  if (result.required) {
    if (!Array.isArray(result.required)) delete result.required;
    else {
      const onlyStrings = result.required.filter((r: any) => typeof r === "string");
      if (onlyStrings.length > 0) result.required = Array.from(new Set(onlyStrings));
      else delete result.required;
    }
  }

  // Recurse
  if (result.properties && typeof result.properties === "object") {
    const newProps: any = {};
    for (const [k, v] of Object.entries(result.properties)) {
      const norm = normalizeJsonSchemaForMCP(sanitizeSchemaForMCP(v));
      if (norm) newProps[k] = norm;
    }
    result.properties = newProps;
    if (Object.keys(result.properties).length === 0) delete result.properties;
  }

  if (result.items) {
    result.items = normalizeJsonSchemaForMCP(sanitizeSchemaForMCP(result.items));
    if (result.items === undefined) delete result.items;
  }

  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray((result as any)[key])) {
      (result as any)[key] = (result as any)[key]
        .map((s: any) => normalizeJsonSchemaForMCP(sanitizeSchemaForMCP(s)))
        .filter(Boolean);
      if ((result as any)[key].length === 0) delete (result as any)[key];
    }
  }

  if (result.enum && Array.isArray(result.enum)) {
    // Ensure enums are unique and non-empty
    const uniq = Array.from(new Set(result.enum));
    if (uniq.length > 0) result.enum = uniq; else delete result.enum;
  }

  // If nothing constrains the schema, default to a string to keep it simple
  const hasConstraints =
    result.type !== undefined ||
    result.enum !== undefined ||
    result.const !== undefined ||
    result.anyOf !== undefined ||
    result.oneOf !== undefined ||
    result.allOf !== undefined ||
    result.properties !== undefined ||
    result.items !== undefined;
  if (!hasConstraints) {
    result.type = "string";
  }

  return result;
}

const tools: Tool[] = [];
const operationMap = new Map<string, any>();

for (const [pathStr, pathItem] of Object.entries(apiSpec.paths as any)) {
  for (const [method, operation] of Object.entries(pathItem as any)) {
    if (method === "parameters") continue;
    const op = operation as any;
    const operationId = op.operationId || `${method}${pathStr.replace(/[\/\W]/g, '_')}`;

    const parameters = [...((pathItem as any).parameters || []), ...(op.parameters || [])];
    const requestBody = op.requestBody;

    const properties: any = {};
    const required: string[] = [];

    const toolMeta = {
      method,
      path: pathStr,
      pathParams: [] as string[],
      queryParams: [] as string[],
      headerParams: [] as string[],
      bodyParams: [] as string[],
      isBodyFlattened: false,
    };

    // Handle path/query/header parameters
    for (const param of parameters) {
      const resolvedParam = param.$ref ? resolveSchema(param) : param;
      const paramSchema = resolveSchema(resolvedParam.schema);
      const sanitizedParamSchema = sanitizeSchemaForMCP(paramSchema);
      const normalizedParamSchema = normalizeJsonSchemaForMCP(sanitizedParamSchema);
      properties[resolvedParam.name] = {
        ...normalizedParamSchema,
        description: resolvedParam.description || normalizedParamSchema?.description,
      };
      if (resolvedParam.required) {
        required.push(resolvedParam.name);
      }
      if (resolvedParam.in === "path") toolMeta.pathParams.push(resolvedParam.name);
      if (resolvedParam.in === "query") toolMeta.queryParams.push(resolvedParam.name);
      if (resolvedParam.in === "header") toolMeta.headerParams.push(resolvedParam.name);
    }

    // Handle request body
    if (requestBody?.content?.["application/json"]?.schema) {
      const bodySchema = resolveSchema(requestBody.content["application/json"].schema);
      if (bodySchema.type === "object" && bodySchema.properties) {
        toolMeta.isBodyFlattened = true;
        for (const [key, value] of Object.entries(bodySchema.properties)) {
          properties[key] = normalizeJsonSchemaForMCP(sanitizeSchemaForMCP(value));
          toolMeta.bodyParams.push(key);
        }
        if (bodySchema.required) {
          required.push(...bodySchema.required);
        }
      } else {
        properties.requestBody = normalizeJsonSchemaForMCP(sanitizeSchemaForMCP(bodySchema));
        toolMeta.bodyParams.push("requestBody");
        if (requestBody.required) {
          required.push("requestBody");
        }
      }
    }

    tools.push({
      name: operationId,
      description: op.description || op.summary || `Execute ${method.toUpperCase()} ${pathStr}`,
      inputSchema: {
        type: "object",
        properties,
        ...(required.length > 0 ? { required: [...new Set(required)] } : {}),
      },
    });

    operationMap.set(operationId, toolMeta);
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolMeta = operationMap.get(name);

  if (!toolMeta) {
    throw new Error(`Tool not found: ${name}`);
  }

  let url = `${API_BASE_URL}${toolMeta.path}`;
  const config: AxiosRequestConfig = {
    method: toolMeta.method,
    headers: {},
    params: {},
  };

  if (API_TOKEN) {
    config.headers!["Authorization"] = `Bearer ${API_TOKEN}`;
  }

  const safeArgs = args || {};

  // Path parameters
  for (const paramName of toolMeta.pathParams) {
    if (safeArgs[paramName] !== undefined) {
      url = url.replace(`{${paramName}}`, encodeURIComponent(String(safeArgs[paramName])));
    } else {
      url = url.replace(`/{${paramName}}`, "");
      url = url.replace(`{${paramName}}`, "");
    }
  }

  // Query parameters
  for (const paramName of toolMeta.queryParams) {
    if (safeArgs[paramName] !== undefined) {
      config.params[paramName] = safeArgs[paramName];
    }
  }

  // Header parameters
  for (const paramName of toolMeta.headerParams) {
    if (safeArgs[paramName] !== undefined) {
      config.headers![paramName] = String(safeArgs[paramName]);
    }
  }

  // Body
  if (toolMeta.bodyParams.length > 0) {
    if (toolMeta.isBodyFlattened) {
      const body: any = {};
      for (const paramName of toolMeta.bodyParams) {
        if (safeArgs[paramName] !== undefined) {
          body[paramName] = safeArgs[paramName];
        }
      }
      config.data = body;
    } else {
      config.data = safeArgs.requestBody;
    }
  }

  try {
    const response = await axios({ ...config, url });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error.response?.data
            ? JSON.stringify(error.response.data, null, 2)
            : error.message,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Centia MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
