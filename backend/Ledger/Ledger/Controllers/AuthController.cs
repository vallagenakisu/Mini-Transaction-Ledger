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

    [HttpPost("register")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(UserDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<UserDto>> Register(RegisterRequestDto request)
    {
        var user = await _authService.RegisterAsync(request);

        return StatusCode(StatusCodes.Status201Created, user);
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
