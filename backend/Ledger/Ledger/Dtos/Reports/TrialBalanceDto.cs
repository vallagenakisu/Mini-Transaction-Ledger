namespace Ledger.Dtos.Reports;

public record TrialBalanceLineDto(
    int AccountId,
    string AccountNumber,
    string AccountName,
    string Type,
    decimal TotalDebits,
    decimal TotalCredits,
    decimal Balance);
