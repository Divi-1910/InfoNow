package offsets

import (
	"context"
	"sync"

	"github.com/segmentio/kafka-go"
)

type partitionState struct {
	initialized   bool
	lastCommitted int64
	acked         map[int64]kafka.Message
}

// Tracker keeps per-partition contiguous commit state.
// A message is only committed when all lower offsets in that partition are acked.
type Tracker struct {
	mu         sync.Mutex
	partitions map[int]partitionState
}

func NewTracker() *Tracker {
	return &Tracker{
		partitions: make(map[int]partitionState),
	}
}

// Ack marks a message as durably processed (or terminally skipped) and eligible for commit.
func (t *Tracker) Ack(msg kafka.Message) {
	t.mu.Lock()
	defer t.mu.Unlock()

	state := t.partitions[msg.Partition]
	if !state.initialized {
		state = partitionState{
			initialized:   true,
			lastCommitted: msg.Offset - 1,
			acked:         make(map[int64]kafka.Message),
		}
	}

	if msg.Offset <= state.lastCommitted {
		t.partitions[msg.Partition] = state
		return
	}

	state.acked[msg.Offset] = msg
	t.partitions[msg.Partition] = state
}

// CommitReady commits the highest contiguous offset frontier in each partition.
func (t *Tracker) CommitReady(
	ctx context.Context,
	commitFn func(context.Context, []kafka.Message) error,
) error {
	t.mu.Lock()
	frontiers := make([]kafka.Message, 0, len(t.partitions))

	for partition, state := range t.partitions {
		if !state.initialized || len(state.acked) == 0 {
			continue
		}

		next := state.lastCommitted + 1
		frontierMsg, ok := state.acked[next]
		if !ok {
			continue
		}

		for {
			msg, exists := state.acked[next]
			if !exists {
				break
			}
			frontierMsg = msg
			next++
		}

		frontiers = append(frontiers, frontierMsg)
		state.lastCommitted = frontierMsg.Offset

		for off := range state.acked {
			if off <= state.lastCommitted {
				delete(state.acked, off)
			}
		}
		t.partitions[partition] = state
	}
	t.mu.Unlock()

	if len(frontiers) == 0 {
		return nil
	}

	if err := commitFn(ctx, frontiers); err != nil {
		// Commit failure is tolerated; uncommitted progress is rebuilt from future acks.
		return err
	}
	return nil
}
