import { type Static, Type } from "@sinclair/typebox";

// These are all based LOOSELY on the internal opentelemetry data formats.
// we try and encode the minimal structure we need
// to make sure things don't break if/when opentelemetry changes data formats
//
// we do this because the built-in validation in `@opentelemetry/otlp-transformer` is garbage
// (it doesn't support deserializing requests)
//
// See this PR for more: https://github.com/open-telemetry/opentelemetry-js/pull/5265

// ============
// Common types
// ============

export const OtelCommonTypes = Type.Module({
  ResourceAttributes: Type.Object({
    key: Type.String(),
    value: Type.Any(),
  }),
  IResource: Type.Object({
    attributes: Type.Array(Type.Ref("ResourceAttributes")),
  }),
  IKeyValue: Type.Object({
    key: Type.String(),
    value: Type.Ref("IAnyValue"),
  }),
  IKeyValueList: Type.Object({
    values: Type.Array(Type.Ref("IKeyValue")),
  }),
  IArrayValue: Type.Object({
    values: Type.Array(Type.Ref("IAnyValue")),
  }),
  IAnyValue: Type.Union([
    Type.Object({
      stringValue: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Object({
      boolValue: Type.Union([Type.Boolean(), Type.Null()]),
    }),
    Type.Object({
      intValue: Type.Union([Type.Number(), Type.Null()]),
    }),
    Type.Object({
      doubleValue: Type.Union([Type.Number(), Type.Null()]),
    }),
    Type.Object({
      arrayValue: Type.Ref("IArrayValue"),
    }),
    Type.Object({
      kvlistValue: Type.Ref("IKeyValueList"),
    }),
    Type.Object({
      bytesValue: Type.Uint8Array(),
    }),
    Type.Const({}),
  ]),
  IInstrumentationScope: Type.Object({
    name: Type.String(),
    version: Type.Optional(Type.String()),
    attributes: Type.Optional(Type.Array(Type.Ref("IKeyValue"))),
    droppedAttributesCount: Type.Optional(Type.Number()),
  }),
  LongBits: Type.Object({
    low: Type.Number(),
    high: Type.Number(),
  }),
  Fixed64: Type.Union([Type.Ref("LongBits"), Type.String(), Type.Number()]),
});

export const TResourceAttributes = OtelCommonTypes.Import("ResourceAttributes");
export type ResourceAttributes = Static<typeof TResourceAttributes>;

export const TKeyValue = OtelCommonTypes.Import("IKeyValue");
export type IKeyValue = Static<typeof TKeyValue>;

export const TKeyValueList = OtelCommonTypes.Import("IKeyValueList");
export type IKeyValueList = Static<typeof TKeyValueList>;

export const TArrayValue = OtelCommonTypes.Import("IArrayValue");
export type IArrayValue = Static<typeof TArrayValue>;

export const TAnyValue = OtelCommonTypes.Import("IAnyValue");
export type IAnyValue = Static<typeof TAnyValue>;

export const TInstrumentationScope = OtelCommonTypes.Import(
  "IInstrumentationScope",
);
export type IInstrumentationScope = Static<typeof TInstrumentationScope>;

export const TLongBits = OtelCommonTypes.Import("LongBits");
export type LongBits = Static<typeof TLongBits>;

export const TFixed64 = OtelCommonTypes.Import("Fixed64");
export type Fixed64 = Static<typeof TFixed64>;

export interface OtlpEncodingOptions {
  /** Convert trace and span IDs to hex strings. */
  useHex?: boolean;
  /** Convert HrTime to 2 part 64 bit values. */
  useLongBits?: boolean;
}

// =========
// Resources
// =========

export const OtelResourceTypes = Type.Module({
  IResource: Type.Object({
    attributes: Type.Array(TKeyValue),
    droppedAttributesCount: Type.Number(),
  }),
});

export const TResource = OtelResourceTypes.Import("IResource");
export type IResource = Static<typeof TResource>;

// ====
// Logs
// ====

export interface IExportLogsServiceResponse {
  /** ExportLogsServiceResponse partialSuccess */
  partialSuccess?: IExportLogsPartialSuccess;
}

export interface IExportLogsPartialSuccess {
  /** ExportLogsPartialSuccess rejectedLogRecords */
  rejectedLogRecords?: number;

  /** ExportLogsPartialSuccess errorMessage */
  errorMessage?: string;
}

/**
 * Numerical value of the severity, normalized to values described in Log Data Model.
 */
export enum ESeverityNumber {
  /** Unspecified. Do NOT use as default */
  SEVERITY_NUMBER_UNSPECIFIED = 0,
  SEVERITY_NUMBER_TRACE = 1,
  SEVERITY_NUMBER_TRACE2 = 2,
  SEVERITY_NUMBER_TRACE3 = 3,
  SEVERITY_NUMBER_TRACE4 = 4,
  SEVERITY_NUMBER_DEBUG = 5,
  SEVERITY_NUMBER_DEBUG2 = 6,
  SEVERITY_NUMBER_DEBUG3 = 7,
  SEVERITY_NUMBER_DEBUG4 = 8,
  SEVERITY_NUMBER_INFO = 9,
  SEVERITY_NUMBER_INFO2 = 10,
  SEVERITY_NUMBER_INFO3 = 11,
  SEVERITY_NUMBER_INFO4 = 12,
  SEVERITY_NUMBER_WARN = 13,
  SEVERITY_NUMBER_WARN2 = 14,
  SEVERITY_NUMBER_WARN3 = 15,
  SEVERITY_NUMBER_WARN4 = 16,
  SEVERITY_NUMBER_ERROR = 17,
  SEVERITY_NUMBER_ERROR2 = 18,
  SEVERITY_NUMBER_ERROR3 = 19,
  SEVERITY_NUMBER_ERROR4 = 20,
  SEVERITY_NUMBER_FATAL = 21,
  SEVERITY_NUMBER_FATAL2 = 22,
  SEVERITY_NUMBER_FATAL3 = 23,
  SEVERITY_NUMBER_FATAL4 = 24,
}

export const OtelLogTypes = Type.Module({
  ILogRecord: Type.Object({
    timeUnixNano: TFixed64,
    observedTimeUnixNano: TFixed64,
    severityNumber: Type.Optional(Type.Enum(ESeverityNumber)),
    severityText: Type.Optional(Type.String()),
    body: Type.Optional(TAnyValue),
    attributes: Type.Array(TKeyValue),
    droppedAttributesCount: Type.Number(),
    flags: Type.Optional(Type.Number()),
    traceId: Type.Optional(Type.Union([Type.String(), Type.Uint8Array()])),
    spanId: Type.Optional(Type.Union([Type.String(), Type.Uint8Array()])),
  }),
  IScopeLogs: Type.Object({
    scope: Type.Optional(TInstrumentationScope),
    logRecords: Type.Optional(Type.Array(Type.Ref("ILogRecord"))),
    schemaUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  }),
  IResourceLogs: Type.Object({
    resource: Type.Optional(TResource),
    scopeLogs: Type.Array(Type.Ref("IScopeLogs")),
    schemaUrl: Type.Optional(Type.String()),
  }),
  IExportLogsServiceRequest: Type.Object({
    resourceLogs: Type.Optional(Type.Array(Type.Ref("IResourceLogs"))),
  }),
});

export const TLogRecord = OtelLogTypes.Import("ILogRecord");
export type ILogRecord = Static<typeof TLogRecord>;

export const TScopeLogs = OtelLogTypes.Import("IScopeLogs");
export type IScopeLogs = Static<typeof TScopeLogs>;

export const TResourceLogs = OtelLogTypes.Import("IResourceLogs");
export type IResourceLogs = Static<typeof TResourceLogs>;

export const TExportLogsServiceRequest = OtelLogTypes.Import(
  "IExportLogsServiceRequest",
);
export type IExportLogsServiceRequest = Static<
  typeof TExportLogsServiceRequest
>;

// =======
// Metrics
// =======

export interface IExportMetricsServiceResponse {
  /** ExportMetricsServiceResponse partialSuccess */
  partialSuccess?: IExportMetricsPartialSuccess;
}

export interface IExportMetricsPartialSuccess {
  /** ExportMetricsPartialSuccess rejectedDataPoints */
  rejectedDataPoints?: number;

  /** ExportMetricsPartialSuccess errorMessage */
  errorMessage?: string;
}

/**
 * AggregationTemporality defines how a metric aggregator reports aggregated
 * values. It describes how those values relate to the time interval over
 * which they are aggregated.
 */
export enum EAggregationTemporality {
  /* UNSPECIFIED is the default AggregationTemporality, it MUST not be used. */
  AGGREGATION_TEMPORALITY_UNSPECIFIED = 0,

  /** DELTA is an AggregationTemporality for a metric aggregator which reports
  changes since last report time. Successive metrics contain aggregation of
  values from continuous and non-overlapping intervals.

  The values for a DELTA metric are based only on the time interval
  associated with one measurement cycle. There is no dependency on
  previous measurements like is the case for CUMULATIVE metrics.

  For example, consider a system measuring the number of requests that
  it receives and reports the sum of these requests every second as a
  DELTA metric:

  1. The system starts receiving at time=t_0.
  2. A request is received, the system measures 1 request.
  3. A request is received, the system measures 1 request.
  4. A request is received, the system measures 1 request.
  5. The 1 second collection cycle ends. A metric is exported for the
      number of requests received over the interval of time t_0 to
      t_0+1 with a value of 3.
  6. A request is received, the system measures 1 request.
  7. A request is received, the system measures 1 request.
  8. The 1 second collection cycle ends. A metric is exported for the
      number of requests received over the interval of time t_0+1 to
      t_0+2 with a value of 2. */
  AGGREGATION_TEMPORALITY_DELTA = 1,

  /** CUMULATIVE is an AggregationTemporality for a metric aggregator which
  reports changes since a fixed start time. This means that current values
  of a CUMULATIVE metric depend on all previous measurements since the
  start time. Because of this, the sender is required to retain this state
  in some form. If this state is lost or invalidated, the CUMULATIVE metric
  values MUST be reset and a new fixed start time following the last
  reported measurement time sent MUST be used.

  For example, consider a system measuring the number of requests that
  it receives and reports the sum of these requests every second as a
  CUMULATIVE metric:

  1. The system starts receiving at time=t_0.
  2. A request is received, the system measures 1 request.
  3. A request is received, the system measures 1 request.
  4. A request is received, the system measures 1 request.
  5. The 1 second collection cycle ends. A metric is exported for the
      number of requests received over the interval of time t_0 to
      t_0+1 with a value of 3.
  6. A request is received, the system measures 1 request.
  7. A request is received, the system measures 1 request.
  8. The 1 second collection cycle ends. A metric is exported for the
      number of requests received over the interval of time t_0 to
      t_0+2 with a value of 5.
  9. The system experiences a fault and loses state.
  10. The system recovers and resumes receiving at time=t_1.
  11. A request is received, the system measures 1 request.
  12. The 1 second collection cycle ends. A metric is exported for the
      number of requests received over the interval of time t_1 to
      t_0+1 with a value of 1.

  Note: Even though, when reporting changes since last report time, using
  CUMULATIVE is valid, it is not recommended. This may cause problems for
  systems that do not use start_time to determine when the aggregation
  value was reset (e.g. Prometheus). */
  AGGREGATION_TEMPORALITY_CUMULATIVE = 2,
}

export const OtelMetricTypes = Type.Module({
  IExportMetricsServiceRequest: Type.Object({
    resourceMetrics: Type.Array(Type.Ref("IResourceMetrics")),
  }),
  IResourceMetrics: Type.Object({
    resource: Type.Optional(TResource),
    scopeMetrics: Type.Array(Type.Ref("IScopeMetrics")),
    schemaUrl: Type.Optional(Type.String()),
  }),
  IScopeMetrics: Type.Object({
    scope: Type.Optional(TInstrumentationScope),
    metrics: Type.Array(Type.Ref("IMetric")),
    schemaUrl: Type.Optional(Type.String()),
  }),
  IMetric: Type.Object({
    name: Type.String(),
    description: Type.Optional(Type.String()),
    unit: Type.Optional(Type.String()),
    // note: the below are actually a union
    gauge: Type.Optional(Type.Ref("IGauge")),
    sum: Type.Optional(Type.Ref("ISum")),
    histogram: Type.Optional(Type.Ref("IHistogram")),
    exponentialHistogram: Type.Optional(Type.Ref("IExponentialHistogram")),
    summary: Type.Optional(Type.Ref("ISummary")),
  }),
  IGauge: Type.Object({
    dataPoints: Type.Array(Type.Ref("INumberDataPoint")),
  }),
  ISum: Type.Object({
    dataPoints: Type.Array(Type.Ref("INumberDataPoint")),
    aggregationTemporality: Type.Enum(EAggregationTemporality),
    isMonotonic: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  }),
  IHistogram: Type.Object({
    dataPoints: Type.Array(Type.Ref("IHistogramDataPoint")),
    aggregationTemporality: Type.Optional(Type.Enum(EAggregationTemporality)),
  }),
  IExponentialHistogram: Type.Object({
    dataPoints: Type.Array(Type.Ref("IExponentialHistogramDataPoint")),
    aggregationTemporality: Type.Optional(Type.Enum(EAggregationTemporality)),
  }),
  ISummary: Type.Object({
    dataPoints: Type.Array(Type.Ref("ISummaryDataPoint")),
  }),
  INumberDataPoint: Type.Object({
    attributes: Type.Array(TKeyValue),
    startTimeUnixNano: Type.Optional(TFixed64),
    timeUnixNano: Type.Optional(TFixed64),
    asDouble: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    asInt: Type.Optional(Type.Number()),
    exemplars: Type.Optional(Type.Array(Type.Ref("IExemplar"))),
    flags: Type.Optional(Type.Number()),
  }),
  IHistogramDataPoint: Type.Object({
    attributes: Type.Optional(Type.Array(TKeyValue)),
    startTimeUnixNano: Type.Optional(TFixed64),
    timeUnixNano: Type.Optional(TFixed64),
    count: Type.Optional(Type.Number()),
    sum: Type.Optional(Type.Number()),
    bucketCounts: Type.Optional(Type.Array(Type.Number())),
    explicitBounds: Type.Optional(Type.Array(Type.Number())),
    exemplars: Type.Optional(Type.Array(Type.Ref("IExemplar"))),
    flags: Type.Optional(Type.Number()),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
  }),
  IExponentialHistogramDataPoint: Type.Object({
    attributes: Type.Optional(Type.Array(TKeyValue)),
    startTimeUnixNano: Type.Optional(TFixed64),
    timeUnixNano: Type.Optional(TFixed64),
    count: Type.Optional(Type.Number()),
    sum: Type.Optional(Type.Number()),
    scale: Type.Optional(Type.Number()),
    zeroCount: Type.Optional(Type.Number()),
    positive: Type.Optional(Type.Ref("IBuckets")),
    negative: Type.Optional(Type.Ref("IBuckets")),
    flags: Type.Optional(Type.Number()),
    exemplars: Type.Optional(Type.Array(Type.Ref("IExemplar"))),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
  }),
  ISummaryDataPoint: Type.Object({
    attributes: Type.Optional(Type.Array(TKeyValue)),
    startTimeUnixNano: Type.Optional(Type.Number()),
    timeUnixNano: Type.Optional(Type.String()),
    count: Type.Optional(Type.Number()),
    sum: Type.Optional(Type.Number()),
    quantileValues: Type.Optional(Type.Array(Type.Ref("IValueAtQuantile"))),
    flags: Type.Optional(Type.Number()),
  }),
  IValueAtQuantile: Type.Object({
    quantile: Type.Optional(Type.Number()),
    value: Type.Optional(Type.Number()),
  }),
  IBuckets: Type.Object({
    offset: Type.Optional(Type.Number()),
    bucketCounts: Type.Optional(Type.Array(Type.Number())),
  }),
  IExemplar: Type.Object({
    filteredAttributes: Type.Optional(Type.Array(TKeyValue)),
    timeUnixNano: Type.Optional(Type.String()),
    asDouble: Type.Optional(Type.Number()),
    asInt: Type.Optional(Type.Number()),
    spanId: Type.Optional(Type.Union([Type.String(), Type.Uint8Array()])),
    traceId: Type.Optional(Type.Union([Type.String(), Type.Uint8Array()])),
  }),
});

export const TExportMetricsServiceRequest = OtelMetricTypes.Import(
  "IExportMetricsServiceRequest",
);
export type IExportMetricsServiceRequest = Static<
  typeof TExportMetricsServiceRequest
>;

export const TResourceMetrics = OtelMetricTypes.Import("IResourceMetrics");
export type IResourceMetrics = Static<typeof TResourceMetrics>;

export const TScopeMetrics = OtelMetricTypes.Import("IScopeMetrics");
export type IScopeMetrics = Static<typeof TScopeMetrics>;

export const TMetric = OtelMetricTypes.Import("IMetric");
export type IMetric = Static<typeof TMetric>;

export const TGauge = OtelMetricTypes.Import("IGauge");
export type IGauge = Static<typeof TGauge>;

export const TSum = OtelMetricTypes.Import("ISum");
export type ISum = Static<typeof TSum>;

export const THistogram = OtelMetricTypes.Import("IHistogram");
export type IHistogram = Static<typeof THistogram>;

export const TExponentialHistogram = OtelMetricTypes.Import(
  "IExponentialHistogram",
);
export type IExponentialHistogram = Static<typeof TExponentialHistogram>;

export const TSummary = OtelMetricTypes.Import("ISummary");
export type ISummary = Static<typeof TSummary>;

export const TNumberDataPoint = OtelMetricTypes.Import("INumberDataPoint");
export type INumberDataPoint = Static<typeof TNumberDataPoint>;

export const THistogramDataPoint = OtelMetricTypes.Import(
  "IHistogramDataPoint",
);
export type IHistogramDataPoint = Static<typeof THistogramDataPoint>;

export const TExponentialHistogramDataPoint = OtelMetricTypes.Import(
  "IExponentialHistogramDataPoint",
);
export type IExponentialHistogramDataPoint = Static<
  typeof TExponentialHistogramDataPoint
>;

export const TSummaryDataPoint = OtelMetricTypes.Import("ISummaryDataPoint");
export type ISummaryDataPoint = Static<typeof TSummaryDataPoint>;

export const TValueAtQuantile = OtelMetricTypes.Import("IValueAtQuantile");
export type IValueAtQuantile = Static<typeof TValueAtQuantile>;

export const TBuckets = OtelMetricTypes.Import("IBuckets");
export type IBuckets = Static<typeof TBuckets>;

export const TExemplar = OtelMetricTypes.Import("IExemplar");
export type IExemplar = Static<typeof TExemplar>;

// ======
// Traces
// ======

export interface IExportTraceServiceResponse {
  /** ExportTraceServiceResponse partialSuccess */
  partialSuccess?: IExportTracePartialSuccess;
}

export interface IExportTracePartialSuccess {
  /** ExportLogsServiceResponse rejectedLogRecords */
  rejectedSpans?: number;

  /** ExportLogsServiceResponse errorMessage */
  errorMessage?: string;
}

/**
 * SpanKind is the type of span. Can be used to specify additional relationships between spans
 * in addition to a parent/child relationship.
 */
export enum ESpanKind {
  /** Unspecified. Do NOT use as default. Implementations MAY assume SpanKind to be INTERNAL when receiving UNSPECIFIED. */
  SPAN_KIND_UNSPECIFIED = 0,

  /** Indicates that the span represents an internal operation within an application,
   * as opposed to an operation happening at the boundaries. Default value.
   */
  SPAN_KIND_INTERNAL = 1,

  /** Indicates that the span covers server-side handling of an RPC or other
   * remote network request.
   */
  SPAN_KIND_SERVER = 2,

  /** Indicates that the span describes a request to some remote service.
   */
  SPAN_KIND_CLIENT = 3,

  /** Indicates that the span describes a producer sending a message to a broker.
   * Unlike CLIENT and SERVER, there is often no direct critical path latency relationship
   * between producer and consumer spans. A PRODUCER span ends when the message was accepted
   * by the broker while the logical processing of the message might span a much longer time.
   */
  SPAN_KIND_PRODUCER = 4,

  /** Indicates that the span describes consumer receiving a message from a broker.
   * Like the PRODUCER kind, there is often no direct critical path latency relationship
   * between producer and consumer spans.
   */
  SPAN_KIND_CONSUMER = 5,
}

/** StatusCode enum. */
export enum EStatusCode {
  /** The default status. */
  STATUS_CODE_UNSET = 0,
  /** The Span has been evaluated by an Application developers or Operator to have completed successfully. */
  STATUS_CODE_OK = 1,
  /** The Span contains an error. */
  STATUS_CODE_ERROR = 2,
}

export const OtelTraceTypes = Type.Module({
  IExportTraceServiceRequest: Type.Object({
    resourceSpans: Type.Optional(Type.Array(Type.Ref("IResourceSpans"))),
  }),
  IResourceSpans: Type.Object({
    resource: Type.Optional(TResource),
    scopeSpans: Type.Array(Type.Ref("IScopeSpans")),
    schemaUrl: Type.Optional(Type.String()),
  }),
  IScopeSpans: Type.Object({
    scope: Type.Optional(TInstrumentationScope),
    spans: Type.Optional(Type.Array(Type.Ref("ISpan"))),
    schemaUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  }),
  ISpan: Type.Object({
    traceId: Type.Union([Type.String(), Type.Uint8Array()]),
    spanId: Type.Union([Type.String(), Type.Uint8Array()]),
    traceState: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    parentSpanId: Type.Optional(Type.Union([Type.String(), Type.Uint8Array()])),
    name: Type.String(),
    kind: Type.Enum(ESpanKind),
    startTimeUnixNano: TFixed64,
    endTimeUnixNano: TFixed64,
    attributes: Type.Array(TKeyValue),
    droppedAttributesCount: Type.Number(),
    events: Type.Array(Type.Ref("IEvent")),
    droppedEventsCount: Type.Number(),
    links: Type.Array(Type.Ref("ILink")),
    droppedLinksCount: Type.Number(),
    status: Type.Ref("IStatus"),
  }),
  IStatus: Type.Object({
    message: Type.Optional(Type.String()),
    code: Type.Enum(EStatusCode),
  }),
  IEvent: Type.Object({
    timeUnixNano: TFixed64,
    name: Type.String(),
    attributes: Type.Array(TKeyValue),
    droppedAttributesCount: Type.Number(),
  }),
  ILink: Type.Object({
    traceId: Type.Union([Type.String(), Type.Uint8Array()]),
    spanId: Type.Union([Type.String(), Type.Uint8Array()]),
    traceState: Type.Optional(Type.String()),
    attributes: Type.Array(TKeyValue),
    droppedAttributesCount: Type.Number(),
  }),
});

export const TExportTraceServiceRequest = OtelTraceTypes.Import(
  "IExportTraceServiceRequest",
);
export type IExportTraceServiceRequest = Static<
  typeof TExportTraceServiceRequest
>;

export const TResourceSpans = OtelTraceTypes.Import("IResourceSpans");
export type IResourceSpans = Static<typeof TResourceSpans>;

export const TScopeSpans = OtelTraceTypes.Import("IScopeSpans");
export type IScopeSpans = Static<typeof TScopeSpans>;

export const TSpan = OtelTraceTypes.Import("ISpan");
export type ISpan = Static<typeof TSpan>;

export const TStatus = OtelTraceTypes.Import("IStatus");
export type IStatus = Static<typeof TStatus>;

export const TEvent = OtelTraceTypes.Import("IEvent");
export type IEvent = Static<typeof TEvent>;

export const TLink = OtelTraceTypes.Import("ILink");
export type ILink = Static<typeof TLink>;
