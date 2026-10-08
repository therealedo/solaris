import { FrontendConfig } from "@solaris/common";

export type LoggingType = "pretty" | "stdout";

export interface Config {
    port?: string;
    sessionSecret: string;
    sessionSecureCookies: boolean;
    connectionString: string;
    serverUrl: string;
    clientUrl: string;
    corsUrls: string[];
    cacheEnabled: boolean;
    logging?: LoggingType;
    logLevel?: string;
    smtp: {
        enabled: boolean;
        host?: string;
        port?: string;
        from?: string;
        username?: string;
        password?: string;
    };
    paypal: {
        environment: string;
        clientId?: string;
        clientSecret?: string;
    };
    discord: {
        serverId?: string;
        clientId?: string;
        clientSecret?: string;
        oauthRedirectUri?: string;
        botToken?: string;
    };
    frontend: FrontendConfig;
    // Self hosted servers: treat every account as an established player, so new
    // accounts can create games without first finishing one.
    everyoneEstablished: boolean;
    llm: {
        geminiApiKey?: string;
        geminiModel: string;
        // Budget per server process (the API and jobs processes each have one).
        requestsPerMinute: number;
        requestsPerDay: number;
    };
}
