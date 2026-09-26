using Ledger.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Ledger.Data.Configurations;

public class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.Property(a => a.AccountNumber).IsRequired().HasMaxLength(10);
        builder.Property(a => a.Name).IsRequired().HasMaxLength(120);
        builder.Property(a => a.Currency).IsRequired().HasMaxLength(3);
        builder.HasIndex(a => a.AccountNumber).IsUnique();
    }
}