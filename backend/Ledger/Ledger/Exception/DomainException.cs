namespace Ledger.Exceptions;

/// <summary>
/// A business-rule failure. Every subclass carries the HTTP status it maps to, so the
/// middleware never needs a type switch — add an exception, and the mapping comes with it.
/// </summary>
public abstract class DomainException : Exception
{
    protected DomainException(string message) : base(message) { }

    public abstract int StatusCode { get; }
}

public sealed class NotFoundException : DomainException
{
    public NotFoundException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status404NotFound;
}

public sealed class ValidationException : DomainException
{
    public ValidationException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status400BadRequest;
}

public sealed class ConflictException : DomainException
{
    public ConflictException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status409Conflict;
}

public sealed class ForbiddenException : DomainException
{
    public ForbiddenException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status403Forbidden;
}