namespace Ledger.Services;

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Ledger.Configuration;
using Ledger.Data;
using Ledger.Dtos.Auth;
using Ledger.Exceptions;
using Ledger.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

public class AuthService : IAuthService
{
    private readonly AppDbContext _context;
    private readonly JwtSettings _jwt;

    public AuthService(AppDbContext context, IOptions<JwtSettings> jwtOptions)
    {
        _context = context;
        _jwt = jwtOptions.Value;
    }

    public async Task<LoginResponseDto?> LoginAsync(LoginRequestDto request)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        var user = await _context.Users
            .SingleOrDefaultAsync(u => u.Email == email);

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return null;
        }

        // Only reached with the right password, so saying the account is inactive tells the
        // caller nothing they could not already prove — unlike a wrong-password reply would.
        if (!user.IsActive)
        {
            throw new ForbiddenException(
                "This account is not active. An administrator needs to approve it.");
        }

        var expiresAtUtc = DateTime.UtcNow.AddMinutes(_jwt.ExpiryMinutes);

        return new LoginResponseDto(GenerateToken(user, expiresAtUtc), expiresAtUtc, ToDto(user));
    }

    public async Task<UserDto> RegisterAsync(RegisterRequestDto request)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        if (await _context.Users.AnyAsync(u => u.Email == email))
        {
            throw new ConflictException("An account with this email already exists.");
        }

        // Self-registered users are always Accountants and start inactive: anyone can ask
        // for access, only an Admin can grant it.
        var user = new User
        {
            FullName = request.FullName.Trim(),
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = UserRole.Accountant,
            IsActive = false,
            CreatedAt = DateTime.UtcNow,
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return ToDto(user);
    }

    public async Task<UserDto?> GetCurrentUserAsync(int userId)
    {
        var user = await _context.Users.FindAsync(userId);

        return user is null || !user.IsActive ? null : ToDto(user);
    }

    private string GenerateToken(User user, DateTime expiresAtUtc)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims: claims,
            expires: expiresAtUtc,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static UserDto ToDto(User user) =>
        new(user.Id, user.FullName, user.Email, user.Role.ToString());
}
