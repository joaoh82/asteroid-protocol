package workers

import (
	"context"
	"fmt"
	"time"

	"github.com/riverqueue/river"
	"gorm.io/gorm"
)

const CollectionsStatsPeriod = 4 * time.Hour

type CollectionsStatsArgs struct {
}

func (CollectionsStatsArgs) Kind() string { return "collections-stats" }

func (CollectionsStatsArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		UniqueOpts: river.UniqueOpts{
			ByArgs:   true,
			ByPeriod: CollectionsStatsPeriod,
		},
	}
}

type CollectionsStatsWorker struct {
	DB *gorm.DB
	river.WorkerDefaults[CollectionsStatsArgs]
}

func (w *CollectionsStatsWorker) Work(ctx context.Context, job *river.Job[CollectionsStatsArgs]) error {
	query := `
	INSERT INTO collection_stats(id, listed, floor_price, floor_price_1d_change, floor_price_1w_change, owners, supply, volume, volume_24h, volume_7d)
		SELECT 
			i.collection_id,
			COUNT(mid.id) as listed, 
			COALESCE(MIN(ml.total), 0) as floor_price,
			(SELECT change FROM collection_floor_daily WHERE collection_id = i.collection_id LIMIT 1) as floor_price_1d_change,
			(SELECT change FROM collection_floor_weekly WHERE collection_id = i.collection_id LIMIT 1) as floor_price_1w_change,
			(SELECT COUNT(DISTINCT current_owner) as owners FROM inscription WHERE collection_id = i.collection_id),
			(SELECT COUNT(id) as supply FROM inscription WHERE collection_id = i.collection_id),
			(SELECT COALESCE(SUM(amount_quote), 0) as volume FROM inscription_trade_history ith INNER JOIN inscription r ON r.id = ith.inscription_id WHERE collection_id = i.collection_id),
			(SELECT COALESCE(SUM(amount_quote), 0) as volume_24h FROM inscription_trade_history ith INNER JOIN inscription r ON r.id = ith.inscription_id WHERE collection_id = i.collection_id and NOW() - ith.date_created <= interval '24 HOURS'),
			(SELECT COALESCE(SUM(amount_quote), 0) as volume_7d FROM inscription_trade_history ith INNER JOIN inscription r ON r.id = ith.inscription_id WHERE collection_id = i.collection_id and NOW() - ith.date_created <= interval '7 DAYS')
		FROM inscription i
		LEFT JOIN marketplace_inscription_detail mid ON i.id = mid.inscription_id
		LEFT JOIN marketplace_listing ml ON ml.id = mid.listing_id
		WHERE i.collection_id IS NOT NULL and (ml.id IS NULL OR (ml.is_cancelled IS FALSE AND ml.is_filled IS FALSE))
		GROUP BY i.collection_id
	ON CONFLICT (id) DO UPDATE SET listed = EXCLUDED.listed, supply = EXCLUDED.supply, owners = EXCLUDED.owners, volume = EXCLUDED.volume, volume_24h = EXCLUDED.volume_24h, volume_7d = EXCLUDED.volume_7d, floor_price = EXCLUDED.floor_price, floor_price_1w_change = EXCLUDED.floor_price_1w_change, floor_price_1d_change = EXCLUDED.floor_price_1d_change
	`

	err := w.DB.Exec(query).Error
	if err != nil {
		return fmt.Errorf("failed to execute database query: %v", err)
	}

	return nil
}
