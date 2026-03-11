// Shared interfaces

export interface EventPayload {
    event: string;
    dims?: Record<string, string>;
    clientId?: string;
}

export interface BatchPayload {
    events: EventPayload[];
}

export interface NormalizedDims {
    dim1Key: string | null;
    dim1Val: string | null;
    dim2Key: string | null;
    dim2Val: string | null;
    dim3Key: string | null;
    dim3Val: string | null;
    dim4Key: string | null;
    dim4Val: string | null;
}

export interface QueryParams {
    project: string;
    event?: string;
    period?: '7d' | '30d' | '90d' | '12m' | 'all';
    group_by?: string;
    from?: string;
    to?: string;
}

export interface SeriesPoint {
    date: string;
    count: number;
    unique: number;
}

export interface QueryResponse {
    total: number;
    uniqueClients: number;
    series?: SeriesPoint[];
    breakdown?: Array<Record<string, string | number>>;
}

export interface ProjectInfo {
    name: string;
    displayName: string | null;
    events: Array<{
        name: string;
        dimensions: string[];
        totalCount: number;
    }>;
    firstEvent: string | null;
    totalCount: number;
}
