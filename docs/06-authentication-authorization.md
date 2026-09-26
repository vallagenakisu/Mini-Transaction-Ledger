# 06 — Authentication and Authorization

**Step 6 of 13.** Previous: `05-database-and-migrations.md` (schema + seeded users ✅). Next: `07-accounts-and-balances.md`.
**Date:** 2026-09-26
**Goal:** turn the two seeded users into a working login. BCrypt verification, a signed JWT
carrying `sub` and `role`, the authentication/authorization middleware pair in the right order,
`POST /api/auth/login` + `GET /api/auth/me`, and the role plumbing that steps 7–8 will hang
`[Authorize(Roles = Roles.Admin)]` off.

This step produces:

```
backend/Ledger/Ledger/
├── Configuration/
│   └── JwtSettings.cs
├── Dtos/
│   └── Auth/
│       ├── LoginRequestDto.cs
│       ├── LoginResponseDto.cs
│       └── UserDto.cs
├── Services/
│   ├── IAuthService.cs
│   └── AuthService.cs
├── Controllers/
│   └── AuthController.cs
├── Extensions/
│   ├── ClaimsPrincipalExtensions.cs
│   └── ServiceCollectionExtensions.cs
├── Authorization/
│   └── Roles.cs
├── appsettings.json                  ← Jwt section, empty Key
└── appsettings.Development.json      ← untracked; holds the real signing key
```

**Two deviations from `02 §2.6`'s folder list, noted deliberately:** `Configuration/` and
`Authorization/` are new. `JwtSettings` is neither a domain model nor an API contract, so it
belongs in neither `Models/` nor `Dtos/`; `Roles` is a pair of constants the `[Authorize]`
attributes bind to. Both are one-file folders on purpose — the alternative is dumping
infrastructure types into `Models/`, which step 4 kept clean of exactly this.

---

## 1. NuGet package

One package:

```bash
cd backend/Ledger/Ledger
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer
```

`BCrypt.Net-Next` is already installed — step 5 used it in the seeder to *hash*. This step uses
the same library to *verify*.

---

## 2. Configuration

### 2.1 `JwtSettings`

```csharp
namespace Ledger.Configuration;

public class JwtSettings
{
    public const string SectionName = "Jwt";

    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; }
}
```

### 2.2 `appsettings.json` (committed — shape only)

```json
{
  "ConnectionStrings": { "DefaultConnection": "" },
  "Jwt": {
    "Key": "",
    "Issuer": "LedgerApi",
    "Audience": "LedgerClient",
    "ExpiryMinutes": 120
  }
}
```

### 2.3 `appsettings.Development.json` (untracked)

```json
{
  "Jwt": {
    "Key": "dev-only-signing-key-change-me-at-least-32-bytes-long"
  }
}
```

This file was removed from git tracking during the step-5 audit and added to `.gitignore`, which
is what makes it a safe home for the key. **Nothing in this step ever puts the key in source.**

> **The key must be at least 32 characters.** HMAC-SHA256 requires a key of at least 256 bits.
> A shorter one throws `IDX10653` at the first token issue — at *runtime*, on the first login,
> not at startup. §7.1 adds an explicit startup check so it fails loudly instead.

---

## 3. DTOs

`Dtos/Auth/LoginRequestDto.cs` — the only place `Password` ever appears as plaintext:

```csharp
namespace Ledger.Dtos.Auth;

using System.ComponentModel.DataAnnotations;

public record LoginRequestDto
{
    [Required]
    [EmailAddress]
    public string Email { get; init; } = string.Empty;

    [Required]
    public string Password { get; init; } = string.Empty;
}
```

`Dtos/Auth/UserDto.cs`:

```csharp
namespace Ledger.Dtos.Auth;

public record UserDto(int Id, string FullName, string Email, string Role);
```

`Dtos/Auth/LoginResponseDto.cs`:

```csharp
namespace Ledger.Dtos.Auth;

public record LoginResponseDto(string Token, DateTime ExpiresAtUtc, UserDto User);
```

**Why `UserDto` and not `User`:** this is the concrete case `02 §2.2` argues in the abstract.
`User` has a `PasswordHash` property. Returning the entity from `/login` would ship every
user's BCrypt hash to the browser on every login. The DTO makes that impossible by
construction rather than by remembering to be careful.

**Why `Role` is a `string` on the DTO, not the `UserRole` enum:** the frontend's route guards
(`02 §3`) compare against `"Admin"`. Serialising the enum without a converter would emit `1`,
and the guard would silently never match. A string is what crosses the wire, so a string is
what the contract says.

**Why `ExpiresAtUtc` is returned explicitly:** the client could decode the JWT payload to read
`exp`, but that means the SPA parsing a token it is supposed to treat as opaque. Handing it the
expiry directly lets the axios interceptor (`02 §3`) pre-empt a 401.

---

## 4. `IAuthService` / `AuthService`

### 4.1 The interface

```csharp
namespace Ledger.Services;

using Ledger.Dtos.Auth;

public interface IAuthService
{
    Task<LoginResponseDto?> LoginAsync(LoginRequestDto request);

    Task<UserDto?> GetCurrentUserAsync(int userId);
}
```

**Why nullable returns instead of throwing:** `ExceptionHandlingMiddleware` doesn't exist until
step 7. Until it does, `null` means "rejected" and the controller maps it to `401`. The service
still obeys `02 §2.2` — it returns a DTO, never an `IActionResult`, and knows nothing about
`HttpContext`.

### 4.2 The implementation

```csharp
namespace Ledger.Services;

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Ledger.Configuration;
using Ledger.Data;
using Ledger.Dtos.Auth;
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

        if (user is null || !user.IsActive)
        {
            return null;
        }

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return null;
        }

        var expiresAtUtc = DateTime.UtcNow.AddMinutes(_jwt.ExpiryMinutes);

        return new LoginResponseDto(GenerateToken(user, expiresAtUtc), expiresAtUtc, ToDto(user));
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
```

**Why `ToLowerInvariant()` on the email:** PostgreSQL string comparison is case-sensitive, and
`Email` has a unique index (step 5, `UserConfiguration`). Without normalising,
`Admin@misl.com` and `admin@misl.com` are two different users to the database and a failed
login to the user. The seeder writes lowercase, so normalising the input is enough here — a
fuller fix (a `citext` column or a computed normalised column) is more machinery than two
seeded users justify.

**Why the same `null` for "no such email" and "wrong password":** returning `404` for an
unknown email and `401` for a bad password turns the login endpoint into a **user-enumeration
oracle** — an attacker learns which addresses are real by reading the status code. One
indistinguishable failure closes that.

> **The honest caveat, worth saying out loud in the viva:** the two paths are not
> indistinguishable in *timing*. An unknown email returns immediately; a known email runs a
> deliberately slow BCrypt verify first. The textbook mitigation is to verify against a dummy
> hash when the user isn't found, so both paths cost the same. Not doing it here is a
> considered trade-off at this scale — but know the attack and know the fix.

**Why `IsActive` is checked at login, and why that isn't sufficient:** a deactivated user cannot
obtain a *new* token, but a token issued five minutes before deactivation stays valid until it
expires — that is the cost of stateless auth, stated plainly in `02`'s rejection of server-side
sessions. The mitigations in play are a short `ExpiryMinutes` and the `IsActive` re-check inside
`GetCurrentUserAsync`. A revocation list would be the real fix and is out of scope.

**Why `GetCurrentUserAsync` hits the database instead of rebuilding the DTO from claims:**
`01 §8` describes `/me` as "current user from token claims", and the claims *identify* the user
— but `FullName` isn't in the token, and a stale token could name a user who has since been
deactivated or renamed. One indexed primary-key lookup is cheap; serving stale identity is not.

---

## 5. Reading the identity back

### 5.1 `Authorization/Roles.cs`

```csharp
namespace Ledger.Authorization;

using Ledger.Models;

public static class Roles
{
    public const string Admin = nameof(UserRole.Admin);
    public const string Accountant = nameof(UserRole.Accountant);
}
```

**Why `nameof` rather than the literal `"Admin"`:** `[Authorize(Roles = "Admin")]` is matched by
*string*. If someone renames the `UserRole.Admin` enum member, every literal in every attribute
still compiles — and every Admin-only endpoint silently becomes reachable by nobody, or worse,
the guard is quietly dropped. `nameof` makes that rename a compile error instead. Steps 7 and 8
use `[Authorize(Roles = Roles.Admin)]` for R14 (reversal) and R16 (account creation).

### 5.2 `Extensions/ClaimsPrincipalExtensions.cs`

```csharp
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
```

**Why this exists at all:** every controller from step 7 onward needs the acting user's id to
stamp `CreatedByUserId` on a transaction. `02 §2.1` is emphatic that this comes from
`User.Claims` and **never** from the request body — a client that can name its own
`CreatedByUserId` can forge the ledger's audit trail. One extension method means one place that
rule is implemented, and it reads naturally at the call site: `User.GetUserId()`.

> **The claim-name trap.** By default `JwtBearer` runs an inbound claim-type map that rewrites
> `sub` to `ClaimTypes.NameIdentifier`, so a token written with `JwtRegisteredClaimNames.Sub`
> is read back under a *different* name and `FindFirstValue("sub")` returns `null`. §7.1 turns
> that mapping off with `MapInboundClaims = false`, which is what makes the code above
> symmetric — the name written is the name read.

---

## 6. `AuthController`

```csharp
namespace Ledger.Controllers;

using Ledger.Dtos.Auth;
using Ledger.Extensions;
using Ledger.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LoginResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<LoginResponseDto>> Login(LoginRequestDto request)
    {
        var result = await _authService.LoginAsync(request);

        return result is null
            ? Unauthorized(new ProblemDetails
            {
                Title = "Invalid credentials",
                Status = StatusCodes.Status401Unauthorized,
            })
            : Ok(result);
    }

    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(UserDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await _authService.GetCurrentUserAsync(User.GetUserId());

        return user is null ? Unauthorized() : Ok(user);
    }
}
```

**Why `[ApiController]` matters here:** it makes DataAnnotations validation on
`LoginRequestDto` automatic — a request with a malformed email returns `400` with a
`ValidationProblemDetails` body before `Login` runs. Without the attribute you'd check
`ModelState.IsValid` by hand in every action.

**Why there's no `/register`:** `01 §8` — ledger users are provisioned, not self-served.
A public registration endpoint on an accounting system lets anyone mint themselves an account;
the seeded demo users cover first login, and the README publishes them.

---

## 7. Wiring

### 7.1 `Extensions/ServiceCollectionExtensions.cs`

```csharp
namespace Ledger.Extensions;

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Ledger.Configuration;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddJwtAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var section = configuration.GetSection(JwtSettings.SectionName);

        var jwt = section.Get<JwtSettings>()
            ?? throw new InvalidOperationException("The 'Jwt' configuration section is missing.");

        if (Encoding.UTF8.GetByteCount(jwt.Key) < 32)
        {
            throw new InvalidOperationException(
                "Jwt:Key must be at least 32 bytes for HMAC-SHA256. " +
                "Set it in appsettings.Development.json (untracked).");
        }

        services.Configure<JwtSettings>(section);

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;

                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Issuer,

                    ValidateAudience = true,
                    ValidAudience = jwt.Audience,

                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.Zero,

                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),

                    NameClaimType = JwtRegisteredClaimNames.Sub,
                    RoleClaimType = ClaimTypes.Role,
                };
            });

        services.AddAuthorization();

        return services;
    }
}
```

**Why the key-length check is here and not left to runtime:** it converts a confusing
`IDX10653` on the first login attempt into a clear startup failure naming the file to fix. The
same fail-fast argument applies to the missing-section throw — an empty `Jwt` section would
otherwise produce tokens signed with an empty key.

**Why `ClockSkew = TimeSpan.Zero`:** the default is **five minutes**. A token whose `exp` passed
four minutes ago is still accepted, which makes expiry behaviour impossible to demonstrate and
quietly extends every token's real lifetime. Zero means `ExpiryMinutes` says what it means. (The
default exists to tolerate clock drift between servers — worth knowing why it's there before
switching it off.)

**Why each validation flag is on:** `ValidateIssuerSigningKey` is the one that actually matters —
without it, a token signed by anyone is accepted, which is the whole security model gone.
Issuer and audience validation stop a token minted for a *different* application by the same
signing key from working here.

### 7.2 `Program.cs`

```csharp
using Ledger.Data;
using Ledger.Extensions;
using Ledger.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddScoped<IAuthService, AuthService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    await DbSeeder.SeedAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
```

**`UseAuthentication()` before `UseAuthorization()` — the guaranteed viva question.**
Authentication reads the `Authorization: Bearer` header, validates the signature and expiry, and
builds a `ClaimsPrincipal` onto `HttpContext.User`. Authorization then evaluates
`[Authorize(Roles = ...)]` against that principal. Reversed, authorization runs against an
anonymous principal that authentication hasn't populated yet — **every authenticated request
gets a 401**, and the failure looks like a broken token rather than a mis-ordered pipeline.
This is the concrete instance of the ordering diagram in `02 §2.1`.

**Why `AddScoped` for `IAuthService`:** it depends on `AppDbContext`, which EF Core registers as
scoped. A singleton service holding a scoped `DbContext` captures it past the end of the
request — the classic captive-dependency bug. Scoped matches the lifetime of the thing it holds.

### 7.3 Optional — a bearer field in the OpenAPI doc

Useful if you want to test from the Scalar/Swagger UI instead of curl:

```csharp
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, cancellationToken) =>
    {
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
        };

        return Task.CompletedTask;
    });
});
```

This is cosmetic and the exact type names track the `Microsoft.OpenApi` major version shipped
with the SDK. **If it doesn't compile, skip it** — §8's curl commands test the same thing and
nothing else in the project depends on it.

---

## 8. Verifying it

Start Postgres, then:

```bash
cd backend/Ledger/Ledger
dotnet run
```

**Login as the seeded admin:**

```bash
curl -sk -X POST https://localhost:7xxx/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@misl.com","password":"Admin@123"}'
```

Expect `200` and `{ "token": "eyJ...", "expiresAtUtc": "...", "user": { "role": "Admin", ... } }`
— and confirm **no `passwordHash` field appears anywhere in the response**.

**Wrong password, and a nonexistent email:**

```bash
curl -sk -o /dev/null -w '%{http_code}\n' -X POST https://localhost:7xxx/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"admin@misl.com","password":"wrong"}'

curl -sk -o /dev/null -w '%{http_code}\n' -X POST https://localhost:7xxx/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"nobody@misl.com","password":"wrong"}'
```

Both must print `401`. Different codes here is the enumeration leak from §4.2.

**`/me` with and without the token:**

```bash
TOKEN=$(curl -sk -X POST https://localhost:7xxx/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"accountant@misl.com","password":"Accountant@123"}' | jq -r .token)

curl -sk https://localhost:7xxx/api/auth/me -H "Authorization: Bearer $TOKEN"   # 200, role Accountant
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost:7xxx/api/auth/me     # 401
```

**Check the claims actually landed.** Paste the token into jwt.io (or decode the middle segment
with `base64 -d`) and confirm `sub` is the user's id, the role claim is present, and `exp` is
`ExpiryMinutes` ahead. If `sub` is missing on the *server* side — `GetUserId()` throwing — that
is the `MapInboundClaims` trap from §5.2.

The port comes from `Properties/launchSettings.json`. `-k` skips the dev certificate check;
`dotnet dev-certs https --trust` removes the need for it.

---

## 9. Building it: step-by-step

### Step 6a. Package
`dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer`.

### Step 6b. Configuration
`Configuration/JwtSettings.cs`; the `Jwt` section in `appsettings.json` (empty `Key`) and the
real key in the untracked `appsettings.Development.json`. **Confirm `git status` does not show
that file** before going further.

### Step 6c. DTOs
`Dtos/Auth/` — `LoginRequestDto`, `UserDto`, `LoginResponseDto`.

### Step 6d. Service
`Services/IAuthService.cs` + `Services/AuthService.cs`.

### Step 6e. Claims plumbing
`Authorization/Roles.cs` and `Extensions/ClaimsPrincipalExtensions.cs`.

### Step 6f. Controller
`Controllers/AuthController.cs`.

### Step 6g. Wiring
`Extensions/ServiceCollectionExtensions.cs`, then `AddJwtAuthentication` +
`AddScoped<IAuthService, AuthService>` and the `UseAuthentication()`/`UseAuthorization()` pair
in `Program.cs`.

### Step 6h. Verify
`dotnet build`, `dotnet run`, then every curl in §8. Both `401`s, one `200` with a role, and no
`passwordHash` in any response body.

---

## 10. Viva questions this step answers

1. **Why JWT rather than a server-side session cookie?** Stateless — the API stores nothing per
   logged-in user, so any instance can serve any request (this is what makes step 11's container
   horizontally scalable). The cost is that a token cannot be revoked before it expires, which
   is why `ExpiryMinutes` is short and `IsActive` is re-checked on `/me`.
2. **Why must `UseAuthentication()` come before `UseAuthorization()`?** Authentication builds the
   `ClaimsPrincipal` that authorization evaluates. Reversed, every `[Authorize]` endpoint sees an
   anonymous principal and returns `401`.
3. **Why does the seeder hash with BCrypt and login `Verify` rather than hashing the input and
   comparing strings?** BCrypt embeds a random per-password salt and the work factor *inside*
   the hash string. Re-hashing the input generates a different salt and therefore a different
   hash, so a string comparison would never match. `Verify` reads the salt out of the stored
   hash and re-derives with it.
4. **Why is the failure for an unknown email identical to the failure for a wrong password?**
   Otherwise the endpoint is a user-enumeration oracle. (And: the timing still differs — the
   fix is verifying against a dummy hash on the not-found path.)
5. **Where does `CreatedByUserId` come from when posting a transaction?** `User.GetUserId()`,
   reading the `sub` claim of the validated token — never the request body. A client-supplied
   user id would let anyone forge the ledger's audit trail.
6. **Why is `Role` in the token instead of looked up per request?** It saves a database round
   trip on every authorized call, which is the point of putting claims in a signed token. The
   trade-off: a role change doesn't take effect until the user's current token expires.
7. **Why return a `UserDto` rather than the `User` entity?** `User.PasswordHash` — serialising
   the entity would return every logged-in user's hash to the browser. The general form of the
   argument is `02 §2.2`; this is its sharpest instance.
8. **What does `ValidateIssuerSigningKey = false` break?** Everything — the API would accept a
   token signed by anyone, including one an attacker minted with `"role": "Admin"`. The
   signature check *is* the security model.
9. **Why `ClockSkew = TimeSpan.Zero`?** The 5-minute default silently extends every token's
   life past its `exp`. The default exists to tolerate clock drift between distributed servers;
   here it only obscures expiry behaviour.
10. **Why is there no registration endpoint?** Ledger users are provisioned, not self-served —
    a public `/register` on an accounting system lets anyone mint an account for themselves.

---

## 11. Out of scope for this step

- **Refresh tokens / rotation** — deliberate scope cut (`01 §10`); short access token, re-login
- **Token revocation / denylist** — the `IsActive` window in `§4.2` is accepted as-is
- **User management endpoints** (create, deactivate, change password, reset) — not in `01 §8`'s
  API surface at all; the two seeded users are the whole user table
- **Rate limiting / lockout on repeated failed logins** — worth *naming* in the viva as the
  obvious next hardening step, not built
- `ExceptionHandlingMiddleware` and `ProblemDetails` standardisation — step 7
- **CORS** — needed once the SPA calls the API; configured in step 10 / step 11
- Frontend `AuthContext`, axios interceptors, `ProtectedRoute` / `AdminRoute` — step 10
- Applying `[Authorize(Roles = Roles.Admin)]` to the actual R14/R16 endpoints — steps 7 and 8,
  which is where those endpoints get written
