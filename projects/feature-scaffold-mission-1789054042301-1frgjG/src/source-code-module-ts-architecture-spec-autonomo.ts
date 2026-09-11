+---------------------------+
| Neptena-OS Mission Control|
+-------------+-------------+
              | (Task Event Trigger)
              v
+-------------------------------------------------------------------+
| WebhookNotificationDispatcher                                     |
|                                                                   |
| 1. initialize()        --> Validates Endpoint & Secret Key        |
| 2. execute(params)     --> Serializes Payload & Timestamp         |
| 3. Signature Engine    --> Computes HMAC SHA-256 (t=...,v1=...)   |
| 4. Dispatch Loop       --> Fetch Execution + Timeout AbortSignal  |
|    |                                                              |
|    +-- [HTTP 2xx Success] ---> Returns WebhookExecutionResult     |
|    |                                                              |
|    +-- [HTTP 5xx / Network Error]                                 |
|            |                                                      |
|            v                                                      |
|        Exponential Backoff Handler (InitialDelay * Factor^Attempt)|
|            |                                                      |
|            +--> Retries up to MaxRetries                          |
|            +--> [Exhausted] -> Returns Failed Result + Telemetry  |
+-------------------------------------------------------------------+