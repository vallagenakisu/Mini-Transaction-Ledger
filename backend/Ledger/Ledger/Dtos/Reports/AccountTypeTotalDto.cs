namespace Ledger.Dtos.Reports;

public record AccountTypeTotalDto(
    string Type,
    int AccountCount,
    decimal Total);
