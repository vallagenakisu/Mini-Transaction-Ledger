namespace Ledger.Dtos.Users;

/// <summary>Both fields optional; only the ones sent are changed.</summary>
public record UpdateUserDto
{
    public bool? IsActive { get; init; }

    public string? Role { get; init; }
}
