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
