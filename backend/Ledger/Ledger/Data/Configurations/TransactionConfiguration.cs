using Ledger.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Ledger.Data.Configurations;

public class TransactionConfiguration : IEntityTypeConfiguration<Transaction>
{
    public void Configure(EntityTypeBuilder<Transaction> builder)
    {
        builder.Property(t => t.Reference).IsRequired().HasMaxLength(20);
        builder.Property(t => t.Description).IsRequired().HasMaxLength(300);

        builder.HasIndex(t => t.Reference).IsUnique();

        builder.HasOne(t => t.CreatedBy)
            .WithMany(u => u.CreatedTransactions)
            .HasForeignKey(t => t.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(t => t.ReversalOf)
            .WithOne(t => t.ReversedBy)
            .HasForeignKey<Transaction>(t => t.ReversalOfTransactionId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}