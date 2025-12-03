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

func (db *DBDriver) GetAllTopicIDs() ([]int, error) {
	selectQuery := `select t.id from "Topic" t`

	rows, err := db.Instance.Query(selectQuery)
	if err != nil {
		log.Printf("Error Executing the Query : %v", err)
		return nil, fmt.Errorf("error executing the query: %v", err)
	}
	defer rows.Close()

	var topicIDs []int

	for rows.Next() {
		var topicID int
		err := rows.Scan(&topicID)
		if err != nil {
			return nil, fmt.Errorf("error executing query : %v", err)
		}
		topicIDs = append(topicIDs, topicID)
	}

	return topicIDs, nil
}

func (db *DBDriver) GetTopicById(topicId int) (Topic, error) {
	topicQuery := `select t.id , t."name", t.slug from "Topic" t where t.id = $1`
	var currentTopic Topic

	row := db.Instance.QueryRow(topicQuery, topicId).Scan(&currentTopic.TopicID, &currentTopic.TopicName, &currentTopic.TopicSlug)
	if row != nil {
		log.Printf("Error Executing the Query : %v", row)
		return Topic{}, fmt.Errorf("error executing the query: %v", row)
	}

	subtopicQuery := `select st.id , st."name" , st.slug from "SubTopic" st where st."topicId"  = $1`
	rows, err := db.Instance.Query(subtopicQuery, topicId)
	if err != nil {
		log.Printf("Error Executing the Query : %v", err)
		return Topic{}, fmt.Errorf("error executing the query: %v", err)
	}

	var subtopic []SubTopic
	for rows.Next() {
		var subtopicID int
		var subtopicName string
		var subtopicSlug string
		err := rows.Scan(&subtopicID, &subtopicName, &subtopicSlug)
		if err != nil {
			log.Printf("Error Scanning the Rows : %v", err)
			return Topic{}, fmt.Errorf("error scanning the rows: %v", err)
		}
		subtopic = append(subtopic, SubTopic{
			SubTopicID:   subtopicID,
			SubTopicName: subtopicName,
			SubTopicSlug: subtopicSlug,
		})
	}

	currentTopic.SubTopics = subtopic

	return currentTopic, nil

}

func (db *DBDriver) GetAllTopicsAndSubTopics() ([]Topic, error) {
	selectQuery := `select t.id as topic_id, t."name"  as topic_name, t.slug as topic_slug ,st.id as subtopic_id , st."name" as subtopic_name,  st.slug as subtopic_slug   from "Topic" t  left join "SubTopic" st on t.id = st."topicId" limit 25`

	rows, err := db.Instance.Query(selectQuery)
	if err != nil {
		log.Printf("Error Executing the Query : %v", err)
		return nil, fmt.Errorf("error executing the query: %v", err)
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
			log.Printf("Error Scanning the Rows : %v", err)
			return nil, fmt.Errorf("error scanning the rows: %v", err)
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
