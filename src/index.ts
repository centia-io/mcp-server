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
      properties[resolvedParam.name] = {
        ...paramSchema,
        description: resolvedParam.description || paramSchema.description,
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
          properties[key] = value;
          toolMeta.bodyParams.push(key);
        }
        if (bodySchema.required) {
          required.push(...bodySchema.required);
        }
      } else {
        properties.requestBody = bodySchema;
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
        required: [...new Set(required)],
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
