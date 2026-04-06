/** Tool definitions for Apple Reminders */
export declare const remindersTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            list_name?: undefined;
            include_completed?: undefined;
            range?: undefined;
            query?: undefined;
            name?: undefined;
            due_date?: undefined;
            priority?: undefined;
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
            list_name: {
                type: string;
                description: string;
            };
            include_completed: {
                type: string;
                description: string;
            };
            range?: undefined;
            query?: undefined;
            name?: undefined;
            due_date?: undefined;
            priority?: undefined;
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
            range: {
                type: string;
                description: string;
            };
            list_name?: undefined;
            include_completed?: undefined;
            query?: undefined;
            name?: undefined;
            due_date?: undefined;
            priority?: undefined;
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
            include_completed: {
                type: string;
                description: string;
            };
            list_name?: undefined;
            range?: undefined;
            name?: undefined;
            due_date?: undefined;
            priority?: undefined;
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
            name: {
                type: string;
                description: string;
            };
            list_name: {
                type: string;
                description: string;
            };
            due_date: {
                type: string;
                description: string;
            };
            priority: {
                type: string;
                description: string;
            };
            body: {
                type: string;
                description: string;
            };
            include_completed?: undefined;
            range?: undefined;
            query?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            name: {
                type: string;
                description: string;
            };
            list_name: {
                type: string;
                description: string;
            };
            include_completed?: undefined;
            range?: undefined;
            query?: undefined;
            due_date?: undefined;
            priority?: undefined;
            body?: undefined;
        };
        required: string[];
    };
})[];
/** Handle a Reminders tool call. Returns null if tool name not recognized. */
export declare function handleRemindersTool(name: string, args: Record<string, unknown>): {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
} | null;
