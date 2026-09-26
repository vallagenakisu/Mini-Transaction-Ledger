namespace Ledger.Middleware;

using Ledger.Exceptions;
using Microsoft.AspNetCore.Mvc;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(
        RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (DomainException ex)
        {
            // Expected: a caller broke a documented rule. Warning, not Error — these are
            // not bugs, and logging them at Error makes real bugs invisible in the noise.
            _logger.LogWarning("{Rule} on {Path}: {Message}",
                ex.GetType().Name, context.Request.Path, ex.Message);

            await WriteProblemAsync(context, ex.StatusCode, ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception on {Path}", context.Request.Path);

            // Never echo ex.Message here — it can carry the schema, a SQL fragment,
            // or the connection string (02 §2.4).
            await WriteProblemAsync(
                context,
                StatusCodes.Status500InternalServerError,
                "An unexpected error occurred.");
        }
    }

    private static async Task WriteProblemAsync(HttpContext context, int status, string title)
    {
        // If the response has already begun streaming, the status line is long gone and
        // writing more would produce a corrupt body. Let it fail as a truncated response.
        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.Clear();
        context.Response.StatusCode = status;

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Instance = context.Request.Path,
        };

        await context.Response.WriteAsJsonAsync(
            problem, options: null, contentType: "application/problem+json");
    }
}
