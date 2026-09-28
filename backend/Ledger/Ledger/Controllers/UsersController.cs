namespace Ledger.Controllers;

using Ledger.Authorization;
using Ledger.Dtos.Users;
using Ledger.Extensions;
using Ledger.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/users")]
[Authorize(Roles = Roles.Admin)]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;

    public UsersController(IUserService userService)
    {
        _userService = userService;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ManagedUserDto>>> GetAll()
    {
        return Ok(await _userService.GetAllAsync());
    }

    [HttpPatch("{id:int}")]
    public async Task<ActionResult<ManagedUserDto>> Update(int id, UpdateUserDto request)
    {
        return Ok(await _userService.UpdateAsync(User.GetUserId(), id, request));
    }
}
