"""complaint multi-label categories

Revision ID: cfd3c6813cd9
Revises: bdaa38220451
Create Date: 2026-08-13 14:41:06.189718

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cfd3c6813cd9'
down_revision: Union[str, Sequence[str], None] = 'bdaa38220451'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable `categories`, backfill it from the old single `category`
    column (so existing complaints don't silently lose their classification),
    then make it required and drop `category`. Split into two batch blocks so
    the backfill UPDATE can still see both columns at once."""
    with op.batch_alter_table('complaints', schema=None) as batch_op:
        batch_op.add_column(sa.Column('categories', sa.JSON(), nullable=True))

    op.execute(
        """
        UPDATE complaints
        SET categories = CASE
            WHEN category IS NOT NULL AND category != '' THEN json_array(category)
            ELSE '["other"]'
        END
        """
    )

    with op.batch_alter_table('complaints', schema=None) as batch_op:
        batch_op.alter_column('categories', existing_type=sa.JSON(), nullable=False)
        batch_op.drop_column('category')


def downgrade() -> None:
    """Best-effort reverse: recreate `category` from the first entry of
    `categories` (any additional categories on a multi-label complaint are
    lost - there's no single-valued column to put them back into)."""
    with op.batch_alter_table('complaints', schema=None) as batch_op:
        batch_op.add_column(sa.Column('category', sa.VARCHAR(length=50), nullable=True))

    op.execute(
        """
        UPDATE complaints
        SET category = json_extract(categories, '$[0]')
        """
    )

    with op.batch_alter_table('complaints', schema=None) as batch_op:
        batch_op.drop_column('categories')
