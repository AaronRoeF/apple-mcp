/** Tool definitions for Apple Notes */
export declare const notesTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            limit: {
                type: string;
                description: string;
            };
            offset: {
                type: string;
                description: string;
            };
            query?: undefined;
            title?: undefined;
            count?: undefined;
            folder?: undefined;
            body?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            offset?: undefined;
            title?: undefined;
            count?: undefined;
            folder?: undefined;
            body?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            title: {
                type: string;
                description: string;
            };
            limit?: undefined;
            offset?: undefined;
            query?: undefined;
            count?: undefined;
            folder?: undefined;
            body?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            limit?: undefined;
            offset?: undefined;
            query?: undefined;
            title?: undefined;
            count?: undefined;
            folder?: undefined;
            body?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            count: {
                type: string;
                description: string;
            };
            limit?: undefined;
            offset?: undefined;
            query?: undefined;
            title?: undefined;
            folder?: undefined;
            body?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            folder: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            offset?: undefined;
            query?: undefined;
            title?: undefined;
            count?: undefined;
            body?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            title: {
                type: string;
                description: string;
            };
            body: {
                type: string;
                description: string;
            };
            folder: {
                type: string;
                description: string;
            };
            limit?: undefined;
            offset?: undefined;
            query?: undefined;
            count?: undefined;
        };
        required: string[];
    };
})[];
/** Handle a Notes tool call. Returns null if tool name not recognized. */
export declare function handleNotesTool(name: string, args: Record<string, unknown>): {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
} | null;
