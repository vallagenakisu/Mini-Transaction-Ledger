namespace Ledger.Services;

using Ledger.Data;
using Ledger.Dtos.Users;
using Ledger.Exceptions;
using Ledger.Models;
using Microsoft.EntityFrameworkCore;

public class UserService : IUserService
{
    private readonly AppDbContext _context;

    public UserService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<ManagedUserDto>> GetAllAsync()
    {
        return await _context.Users
            .AsNoTracking()
            .OrderBy(u => u.IsActive)
            .ThenBy(u => u.FullName)
            .Select(u => new ManagedUserDto(
                u.Id, u.FullName, u.Email, u.Role.ToString(), u.IsActive, u.CreatedAt))
            .ToListAsync();
    }

    public async Task<ManagedUserDto> UpdateAsync(int actingUserId, int userId, UpdateUserDto request)
    {
        // An admin editing their own row is the only way the last admin can lock everyone
        // out, so it is refused outright rather than counted.
        if (actingUserId == userId)
        {
            throw new ForbiddenException("You cannot change your own access.");
        }

        var user = await _context.Users.FindAsync(userId)
            ?? throw new NotFoundException($"User {userId} not found.");

        if (request.Role is not null)
        {
            if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: true, out var role)
                || !Enum.IsDefined(role))
            {
                throw new ValidationException($"Unknown role '{request.Role}'.");
            }

            user.Role = role;
        }

        if (request.IsActive is bool isActive)
        {
            user.IsActive = isActive;
        }

        await _context.SaveChangesAsync();

        return new ManagedUserDto(
            user.Id, user.FullName, user.Email, user.Role.ToString(), user.IsActive, user.CreatedAt);
    }
}
