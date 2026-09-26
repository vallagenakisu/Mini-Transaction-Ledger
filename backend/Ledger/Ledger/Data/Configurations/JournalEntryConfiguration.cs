namespace Ledger.Data.Configurations;

using Ledger.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class JournalEntryConfiguration : IEntityTypeConfiguration<JournalEntry>
{
    public void Configure(EntityTypeBuilder<JournalEntry> builder)
    {
        builder.Property(e => e.Amount).HasPrecision(18, 4);

        builder.ToTable(t => t.HasCheckConstraint("CK_JournalEntry_Amount_Positive", "\"Amount\" > 0"));

        builder.HasOne(e => e.Transaction)
            .WithMany(t => t.JournalEntries)
            .HasForeignKey(e => e.TransactionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.Account)
            .WithMany(a => a.JournalEntries)
            .HasForeignKey(e => e.AccountId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}