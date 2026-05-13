const logger = require("./logger");
const { buildRequestCorrelation } = require("./auditMetadata");

const isProduction = process.env.NODE_ENV === "production";

const hooks = {
  onComplete: null,
  onError: null,
};

function setAsyncHandlerHooks(next = {}) {
  Object.assign(hooks, next);
}

function getSlowRouteWarnMs() {
  const raw = Number.parseInt(
    process.env.ASYNC_HANDLER_SLOW_ROUTE_MS || "3000",
    10
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 3000;
}

/**
 * Optional monitoring budget (ms). When set, successful handlers that exceed it log a warn event only.
 * Does not abort the request (Express has no standard request timeout here).
 */
function getHandlerBudgetMs() {
  const raw = Number.parseInt(process.env.ASYNC_HANDLER_BUDGET_MS || "0", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function resolveHandlerName(handler) {
  if (typeof handler !== "function") return "invalid";
  const n = handler.name && String(handler.name).trim();
  return n || "anonymous";
}

function buildAsyncHandlerContext(req, handlerName) {
  const corr = buildRequestCorrelation(req);
  return {
    event: "async_handler",
    handlerName,
    method: req?.method,
    path: req?.originalUrl || req?.path,
    correlationId: corr.correlationId || corr.requestId || null,
    requestId: corr.requestId,
    idempotencyKey: corr.idempotencyKey,
    userId: req?.user?.userId ?? null,
    role: req?.user?.role ?? null,
    libraryId: req?.user?.libraryId ?? null,
  };
}

function logAsyncHandlerRejection(ctx, err, durationMs) {
  logger.error("Async route handler rejected", {
    event: "async_handler_rejection",
    ...ctx,
    durationMs,
    errorName: err?.name,
    errorMessage:
      err?.message != null ? String(err.message).slice(0, 500) : undefined,
    statusCode: err?.statusCode ?? err?.status,
    stack:
      !isProduction && err?.stack
        ? String(err.stack).slice(0, 8000)
        : undefined,
  });
}

function recordSuccessTelemetry(req, handlerName, startedAt) {
  const durationMs = Date.now() - startedAt;
  const ctx = buildAsyncHandlerContext(req, handlerName);
  try {
    const budgetMs = getHandlerBudgetMs();
    if (budgetMs > 0 && durationMs > budgetMs) {
      logger.warn("Async handler exceeded configured budget (monitoring)", {
        event: "async_handler_budget_exceeded",
        ...ctx,
        durationMs,
        budgetMs,
      });
    } else if (durationMs > getSlowRouteWarnMs()) {
      logger.warn("Slow async route handler", {
        event: "async_handler_slow",
        ...ctx,
        durationMs,
        slowThresholdMs: getSlowRouteWarnMs(),
      });
    }
    hooks.onComplete?.({ ...ctx, durationMs, ok: true });
  } catch (e) {
    logger.warn("asyncHandler success telemetry failed", {
      message: e?.message,
      handlerName,
    });
  }
}

function asyncHandler(handler) {
  if (typeof handler !== "function") {
    logger.error("asyncHandler misconfigured: handler is not a function", {
      event: "async_handler_misconfig",
      handlerType: typeof handler,
    });
    const err = Object.assign(
      new TypeError("asyncHandler: expected a function"),
      { statusCode: 500 }
    );
    return (_req, _res, next) => next(err);
  }

  const handlerName = resolveHandlerName(handler);

  function wrapped(req, res, next) {
    const startedAt = Date.now();

    Promise.resolve()
      .then(() => handler(req, res, next))
      .then(
        () => {
          recordSuccessTelemetry(req, handlerName, startedAt);
        },
        (err) => {
          const durationMs = Date.now() - startedAt;
          const ctx = buildAsyncHandlerContext(req, handlerName);
          logAsyncHandlerRejection(ctx, err, durationMs);
          try {
            hooks.onError?.({ ...ctx, durationMs, err });
          } catch (e) {
            logger.warn("asyncHandler onError hook failed", {
              message: e?.message,
              handlerName,
            });
          }
          next(err);
        }
      );
  }

  Object.defineProperty(wrapped, "name", {
    value: `asyncHandler(${handlerName})`,
    configurable: true,
  });

  return wrapped;
}

asyncHandler.setAsyncHandlerHooks = setAsyncHandlerHooks;

module.exports = asyncHandler;
