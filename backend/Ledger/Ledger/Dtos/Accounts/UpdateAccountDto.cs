namespace Ledger.Dtos.Accounts;

using System.ComponentModel.DataAnnotations;

public record UpdateAccountDto
{
    [Required]
    [MaxLength(120)]
    public string Name { get; init; } = string.Empty;

    public bool AllowsNegativeBalance { get; init; }
}