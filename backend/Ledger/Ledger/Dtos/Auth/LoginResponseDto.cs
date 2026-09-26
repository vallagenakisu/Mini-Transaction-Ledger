namespace Ledger.Dtos.Auth;

public record LoginResponseDto(string Token, DateTime ExpiresAtUtc, UserDto User);
