namespace Ledger.Services;

using Ledger.Dtos.Users;

public interface IUserService
{
    Task<IReadOnlyList<ManagedUserDto>> GetAllAsync();

    Task<ManagedUserDto> UpdateAsync(int actingUserId, int userId, UpdateUserDto request);
}
