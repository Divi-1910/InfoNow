FROM golang:1.24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /ingestor ./cmd/main.go

FROM alpine:3.20
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /ingestor /usr/local/bin/ingestor
ENTRYPOINT ["/usr/local/bin/ingestor"]
