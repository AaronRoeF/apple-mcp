/** Tool definitions for Apple Calendar */
export declare const calendarTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            start_date?: undefined;
            end_date?: undefined;
            query?: undefined;
            limit?: undefined;
            count?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            start_date: {
                type: string;
                description: string;
            };
            end_date: {
                type: string;
                description: string;
            };
            query?: undefined;
            limit?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            start_date?: undefined;
            end_date?: undefined;
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
            count: {
                type: string;
                description: string;
            };
            start_date?: undefined;
            end_date?: undefined;
            query?: undefined;
            limit?: undefined;
        };
        required?: undefined;
    };
})[];
/** Handle a Calendar tool call. Returns null if tool name not recognized. */
export declare function handleCalendarTool(name: string, args: Record<string, unknown>): {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
} | null;
