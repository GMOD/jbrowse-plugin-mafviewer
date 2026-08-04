#!/usr/bin/env perl
# Convert a MAF on stdin to the tabix-indexable BED the MafTabixAdapter reads.
# Output is interchangeable with https://github.com/cmdcolin/maf2bed (the Rust
# version), which is much faster on whole-genome alignments.
use warnings;
use strict;

sub usage {
    print STDERR <<"END";
Usage: maf2bed.pl <assembly> < file.maf | sort -k1,1 -k2,2n | bgzip > out.bed.gz

<assembly> names the genome to use as the BED's reference: it is the part of
the MAF `src` token before the contig, so `maf2bed.pl hg38` turns a `hg38.chr1`
row into a `chr1` line and carries every other species in column 6.
END
    exit shift;
}

usage(1) if !@ARGV;
usage(0) if $ARGV[0] eq '-h' || $ARGV[0] eq '--help';

my $asm    = $ARGV[0];
my $prefix = "$asm.";
my $plen   = length($prefix);

my $id      = 0;
my $open    = 0;
my $has_ref = 0;
my @rows;
my ( $chrom, $start, $end, $score ) = ( '', 0, 0, 0 );

# `a score=5334.0` -> 5334. The `a` line carries any number of key=value pairs
# in any order, so score is searched for rather than assumed to come first. A
# block with no score, or an unparseable one, scores 0 rather than dying.
sub parse_score {
    for my $tok ( split( ' ', $_[0] ) ) {
        next if $tok !~ /^score=(.*)$/s;
        my $v = $1;
        # Perl's numeric conversion is lenient about trailing garbage, so the
        # value is vetted before it is used; 0+ then normalizes 5334.0 to 5334.
        return $v =~ /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/ ? 0 + $v : 0;
    }
    return 0;
}

sub emit {
    # A block that never mentioned the reference has no interval of its own, so
    # it is skipped rather than printed at the previous block's coordinates.
    return if !$has_ref;
    print join( "\t", $chrom, $start, $end, "${asm}_$id", $score,
        join( ',', @rows ) ), "\n";
}

while ( my $line = <STDIN> ) {
    $line =~ s/\r?\n\z//;

    if ( $line =~ /^s\s/ ) {
        next if !$open;

        # Only the six leading tokens need picking apart; the alignment text is
        # the bulk of the file, so the limit hands it back whole instead of
        # splitting it. ' ' (not / /) splits on runs of any whitespace, so
        # tab-separated and column-padded MAFs parse alike.
        my ( undef, $src, $rstart, $size, $strand, $src_size, $text ) =
          split( ' ', $line, 7 );
        next if !defined $text || $text eq '';

        push @rows, join( ':', $src, $rstart, $size, $strand, $src_size, $text );

        # First reference row wins: a block holding several, as cactus-hal2maf
        # --outType norm produces, is placed at the first rather than at an
        # arbitrary paralog. Every copy still rides along in column 6.
        next if $has_ref;
        next if substr( $src, 0, $plen ) ne $prefix;
        next if $rstart !~ /^\d+$/ || $size !~ /^\d+$/ || $src_size !~ /^\d+$/;

        my ( $s, $e ) = ( $rstart, $rstart + $size );

        # A `-` row's start is measured on the reverse complement of the
        # source, so it has to be flipped back before it means anything as a
        # BED interval. Column 6 still reports the row as the MAF had it.
        if ( $strand eq '-' ) {
            next if $e > $src_size;
            ( $s, $e ) = ( $src_size - $e, $src_size - $rstart );
        }

        $has_ref = 1;
        $chrom   = substr( $src, $plen );
        $start   = $s;
        $end     = $e;
    }
    elsif ( $line =~ /^a(?:\s|$)/ ) {
        # Close the previous block before adopting this line's score, so a
        # block is emitted with its own score rather than its successor's.
        if ($open) {
            $id += 1;
            emit();
        }
        $has_ref = 0;
        @rows    = ();
        $score   = parse_score($line);
        $open    = 1;
    }
}

if ($open) {
    $id += 1;
    emit();
}
