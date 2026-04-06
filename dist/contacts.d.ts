/** Tool definitions for Apple Contacts */
export declare const contactsTools: ({
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
            id?: undefined;
            count?: undefined;
            company?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            id: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
            count?: undefined;
            company?: undefined;
        };
        required: string[];
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
            query?: undefined;
            limit?: undefined;
            id?: undefined;
            company?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            company: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            query?: undefined;
            id?: undefined;
            count?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            query?: undefined;
            limit?: undefined;
            id?: undefined;
            count?: undefined;
            company?: undefined;
        };
        required?: undefined;
    };
})[];
/** Handle a Contacts tool call. Returns null if tool name not recognized. */
export declare function handleContactsTool(name: string, args: Record<string, unknown>): {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
} | null;
