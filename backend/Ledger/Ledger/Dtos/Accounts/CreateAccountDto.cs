namespace Ledger.Dtos.Accounts;

using System.ComponentModel.DataAnnotations;

public record CreateAccountDto
{
    [Required]
    [MaxLength(10)]
    public string AccountNumber { get; init; } = string.Empty;

    [Required]
    [MaxLength(120)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Type { get; init; } = string.Empty;

    [Required]
    [MaxLength(3)]
    public string Currency { get; init; } = "BDT";

    public bool AllowsNegativeBalance { get; init; }
}