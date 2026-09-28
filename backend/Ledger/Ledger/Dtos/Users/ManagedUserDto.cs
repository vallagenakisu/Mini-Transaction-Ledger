namespace Ledger.Dtos.Users;

public record ManagedUserDto(
    int Id,
    string FullName,
    string Email,
    string Role,
    bool IsActive,
    DateTime CreatedAt);
