package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type DBDriver struct {
	ConnectionString string
	Instance         *sql.DB
}

type Topic struct {
	TopicID   int
	TopicName string
	TopicSlug string
	SubTopics []SubTopic
}

type SubTopic struct {
	SubTopicID   int
	SubTopicName string
	SubTopicSlug string
}

func NewDBDriver(ConnectionString string, MaxOpenConnections int, MaxIdleConnections int, ConnectionLifeTime time.Duration) *DBDriver {
	db, err := sql.Open("pgx", ConnectionString)
	if err != nil {
		log.Fatalf("Error Connecting the Postgres DB : %v", err)
	}

	db.SetMaxIdleConns(MaxIdleConnections)
	db.SetMaxOpenConns(MaxOpenConnections)
	db.SetConnMaxLifetime(ConnectionLifeTime)

	if err := db.Ping(); err != nil {
		log.Fatalf("Error Connecting the Postgres DB : %v", err)
	}

	return &DBDriver{
		ConnectionString: ConnectionString,
		Instance:         db,
	}
}

func (db *DBDriver) Close() {
	db.Instance.Close()
}

func (db *DBDriver) GetAllTopicsAndSubTopics() ([]Topic, error) {
	selectQuery := `select t.id as topic_id, t."name"  as topic_name, t.slug as topic_slug ,st.id as subtopic_id , st."name" as subtopic_name,  st.slug as subtopic_slug   from "Topic" t  left join "SubTopic" st on t.id = st."topicId" order by topic_id 
`

	var topics []Topic
	rows, err := db.Instance.Query(selectQuery)
	if err != nil {
		log.Fatalf("Error Executing the Query : %v", err)
	}
	defer rows.Close()

	topicsMap := make(map[int]*Topic)

	for rows.Next() {
		var topicID int
		var topicName sql.NullString
		var topicSlug sql.NullString
		var subTopicID sql.NullInt64
		var subTopicName sql.NullString
		var subTopicSlug sql.NullString

		err := rows.Scan(&topicID, &topicName, &topicSlug, &subTopicID, &subTopicName, &subTopicSlug)
		if err != nil {
			log.Fatalf("Error Scanning the Rows : %v", err)
		}

		currentTopic, exists := topicsMap[topicID]
		if !exists {
			currentTopic = &Topic{
				TopicID:   topicID,
				TopicName: topicName.String,
				TopicSlug: topicSlug.String,
				SubTopics: []SubTopic{},
			}
			topicsMap[topicID] = currentTopic
			topics = append(topics, *currentTopic)
		}

		if subTopicID.Valid {
			currentSubTopic := SubTopic{
				SubTopicID:   int(subTopicID.Int64),
				SubTopicName: subTopicName.String,
				SubTopicSlug: subTopicSlug.String,
			}
			currentTopic.SubTopics = append(currentTopic.SubTopics, currentSubTopic)
		}

	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error : %w", err)
	}

	result := make([]Topic, 0, len(topicsMap))
	for _, topic := range topicsMap {
		result = append(result, *topic)
	}

	return result, nil
}
