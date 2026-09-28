namespace Ledger.Services;

using Ledger.Dtos.Auth;

public interface IAuthService
{
    Task<LoginResponseDto?> LoginAsync(LoginRequestDto request);

    Task<UserDto> RegisterAsync(RegisterRequestDto request);

    Task<UserDto?> GetCurrentUserAsync(int userId);
}
