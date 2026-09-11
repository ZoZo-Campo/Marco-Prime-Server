export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Marco Prime API",
    version: "1.0.0",
    description: "API for managing orders, products, members, and recharges",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Development server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
      Member: {
        type: "object",
        properties: {
          id: { type: "number" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          cardNumber: { type: "number" },
          balance: { type: "string" },
          admin: { type: "boolean" },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "number" },
          title: { type: "string" },
          name: { type: "string" },
          color: { type: "string", nullable: true },
          price: { type: "string" },
          productTypeId: { type: "number" },
          available: { type: "boolean" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        description: "Check if the API is running",
        tags: ["Health"],
        responses: {
          "200": {
            description: "API is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/member/{card_number}": {
      get: {
        summary: "Get member by card number",
        description: "Retrieve member information by card number",
        tags: ["Members"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "card_number",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            description: "Member found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Member" },
              },
            },
          },
          "404": {
            description: "Member not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/v1/products": {
      get: {
        summary: "Get all products",
        description: "Retrieve list of all products",
        tags: ["Products"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "List of products",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Product" },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/product-types": {
      get: {
        summary: "Get product types",
        description: "Retrieve product categories and available product counts",
        tags: ["Products"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "List of product types",
          },
        },
      },
    },
    "/api/v1/products/{product_type_id}": {
      get: {
        summary: "Get products by type",
        description: "Retrieve paginated available products for a category",
        tags: ["Products"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "product_type_id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1, minimum: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated products",
          },
        },
      },
    },
    "/api/v1/catalog-selection": {
      get: {
        summary: "Get the configurable Marco catalogue",
        description:
          "Retrieve available Fouaille products and their local Marco selection state",
        tags: ["Products"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Available products and selection state" },
        },
      },
      put: {
        summary: "Replace the local Marco product selection",
        description:
          "Select the subset of available Fouaille products offered on this Marco",
        tags: ["Products"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["adminCardNumber", "productIds"],
                properties: {
                  adminCardNumber: { type: "integer" },
                  productIds: {
                    type: "array",
                    items: { type: "integer" },
                    uniqueItems: true,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Selection saved" },
          "400": { description: "Invalid or unavailable product" },
          "403": { description: "Administrator card required" },
        },
      },
    },
    "/api/v1/history": {
      get: {
        summary: "Get order history",
        description: "Retrieve paginated order history",
        tags: ["Orders"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated order history",
          },
        },
      },
    },
    "/api/v1/statistics": {
      post: {
        summary: "Calculate sales statistics",
        description:
          "Calculate revenue, locally configured costs and estimated profit for a date range",
        tags: ["Statistics"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["adminCardNumber", "from", "to"],
                properties: {
                  adminCardNumber: { type: "integer" },
                  from: { type: "string", format: "date-time" },
                  to: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Sales and profit statistics" },
          "400": { description: "Invalid date range" },
          "403": { description: "Administrator card required" },
        },
      },
    },
    "/api/v1/statistics/costs": {
      post: {
        summary: "Get locally configured purchase costs",
        tags: ["Statistics"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Products and local purchase costs" },
          "403": { description: "Administrator card required" },
        },
      },
      put: {
        summary: "Save local purchase costs",
        description:
          "Store purchase costs in the Marco data volume without modifying Fouaille",
        tags: ["Statistics"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Purchase costs saved locally" },
          "400": { description: "Invalid product or price" },
          "403": { description: "Administrator card required" },
        },
      },
    },
    "/api/v1/accounting": {
      post: {
        summary: "Read the local real-world accounting table",
        tags: ["Accounting"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Measured liters, actual revenue and result" },
          "403": { description: "Administrator card required" },
        },
      },
      put: {
        summary: "Save the local real-world accounting table",
        description:
          "Stores measured liters, purchase price per liter and actual revenue without modifying Fouaille",
        tags: ["Accounting"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Accounting table saved" },
          "400": { description: "Invalid accounting row" },
          "403": { description: "Administrator card required" },
        },
      },
    },
    "/api/v1/order-corrections": {
      post: {
        summary: "List recent purchases and their correction status",
        tags: ["Corrections"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Recent purchases" },
          "403": { description: "Administrator card required" },
        },
      },
    },
    "/api/v1/order-corrections/apply": {
      post: {
        summary: "Cancel or replace an existing purchase",
        description:
          "Refunds the original line and optionally creates its replacement in one MySQL transaction",
        tags: ["Corrections"],
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Correction completed" },
          "400": { description: "Purchase cannot be corrected" },
          "403": { description: "Administrator card required" },
          "409": { description: "Purchase already corrected or pending review" },
          "503": { description: "Result uncertain; manual review required" },
        },
      },
    },
    "/api/v1/purchase": {
      post: {
        summary: "Create a purchase",
        description: "Create a new purchase order",
        tags: ["Purchases"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["transactionId", "cardNumber", "items"],
                properties: {
                  transactionId: { type: "string", format: "uuid" },
                  cardNumber: { type: "integer" },
                  items: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["productId", "amount"],
                      properties: {
                        productId: { type: "integer" },
                        amount: { type: "integer", minimum: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Purchase created successfully",
          },
          "400": {
            description: "Bad request",
          },
          "404": {
            description: "Product or member not found",
          },
        },
      },
    },
    "/api/v1/recharge": {
      post: {
        summary: "Create a recharge",
        description: "Recharge a member's balance",
        tags: ["Recharges"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["transactionId", "cardNumber", "amount"],
                properties: {
                  transactionId: { type: "string", format: "uuid" },
                  cardNumber: { type: "integer" },
                  adminCardNumber: { type: "integer" },
                  amount: { type: "number" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Recharge created successfully",
          },
          "403": {
            description: "Forbidden",
          },
          "404": {
            description: "Member not found",
          },
        },
      },
    },
  },
};
