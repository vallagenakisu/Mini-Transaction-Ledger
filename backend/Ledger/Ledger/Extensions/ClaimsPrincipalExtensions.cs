namespace Ledger.Extensions;

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Ledger.Models;

public static class ClaimsPrincipalExtensions
{
    public static int GetUserId(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? throw new InvalidOperationException("Token has no subject claim.");

        return int.Parse(value);
    }

    public static UserRole GetRole(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(ClaimTypes.Role)
            ?? throw new InvalidOperationException("Token has no role claim.");

        return Enum.Parse<UserRole>(value);
    }
}
