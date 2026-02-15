pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  parameters {
    string(name: 'IMAGE_TAG', defaultValue: '', description: 'Optional image tag (defaults to git sha)')
    string(name: 'K8S_NAMESPACE', defaultValue: 'infonow', description: 'Kubernetes namespace')
    booleanParam(name: 'DEPLOY', defaultValue: true, description: 'Deploy after push')
  }

  environment {
    REGISTRY = 'ghcr.io/your-org'
    DOCKER_CREDS_ID = 'docker-registry-creds'
    KUBECONFIG_CRED_ID = 'kubeconfig-file'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build + Push Images') {
      steps {
        script {
          def gitSha = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
          env.TAG = params.IMAGE_TAG?.trim() ? params.IMAGE_TAG.trim() : gitSha

          env.BACKEND_IMAGE = "${env.REGISTRY}/infonow-backend:${env.TAG}"
          env.FRONTEND_IMAGE = "${env.REGISTRY}/infonow-frontend:${env.TAG}"
          env.INGESTOR_IMAGE = "${env.REGISTRY}/infonow-ingestor:${env.TAG}"
          env.TRANSFORMER_IMAGE = "${env.REGISTRY}/infonow-transformer:${env.TAG}"
          env.NEWS_ENRICHER_IMAGE = "${env.REGISTRY}/infonow-news-enricher:${env.TAG}"
          env.YT_ENRICHER_IMAGE = "${env.REGISTRY}/infonow-yt-enricher:${env.TAG}"
        }

        withCredentials([usernamePassword(credentialsId: env.DOCKER_CREDS_ID, usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
          sh '''
            set -e

            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin ${REGISTRY}

            docker build -t ${BACKEND_IMAGE} ./backend
            docker build -t ${FRONTEND_IMAGE} --build-arg VITE_BACKEND_URL=/api ./frontend
            docker build -t ${INGESTOR_IMAGE} ./ingestor
            docker build -t ${TRANSFORMER_IMAGE} ./transformer
            docker build -t ${NEWS_ENRICHER_IMAGE} ./enrichers/news-enricher
            docker build -t ${YT_ENRICHER_IMAGE} ./enrichers/yt-enricher

            docker push ${BACKEND_IMAGE}
            docker push ${FRONTEND_IMAGE}
            docker push ${INGESTOR_IMAGE}
            docker push ${TRANSFORMER_IMAGE}
            docker push ${NEWS_ENRICHER_IMAGE}
            docker push ${YT_ENRICHER_IMAGE}
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      when {
        expression { return params.DEPLOY }
      }
      steps {
        withCredentials([file(credentialsId: env.KUBECONFIG_CRED_ID, variable: 'KUBECONFIG_FILE')]) {
          sh '''
            set -e
            export KUBECONFIG="$KUBECONFIG_FILE"

            kubectl apply -k infra/k8s/base

            kubectl -n ${K8S_NAMESPACE} set image deployment/backend backend=${BACKEND_IMAGE}
            kubectl -n ${K8S_NAMESPACE} set image deployment/frontend frontend=${FRONTEND_IMAGE}
            kubectl -n ${K8S_NAMESPACE} set image deployment/ingestor ingestor=${INGESTOR_IMAGE}
            kubectl -n ${K8S_NAMESPACE} set image deployment/transformer transformer=${TRANSFORMER_IMAGE}
            kubectl -n ${K8S_NAMESPACE} set image deployment/news-enricher news-enricher=${NEWS_ENRICHER_IMAGE}
            kubectl -n ${K8S_NAMESPACE} set image deployment/yt-enricher yt-enricher=${YT_ENRICHER_IMAGE}

            kubectl -n ${K8S_NAMESPACE} rollout status deployment/backend --timeout=180s
            kubectl -n ${K8S_NAMESPACE} rollout status deployment/frontend --timeout=180s
            kubectl -n ${K8S_NAMESPACE} rollout status deployment/ingestor --timeout=180s
            kubectl -n ${K8S_NAMESPACE} rollout status deployment/transformer --timeout=300s
            kubectl -n ${K8S_NAMESPACE} rollout status deployment/news-enricher --timeout=300s
            kubectl -n ${K8S_NAMESPACE} rollout status deployment/yt-enricher --timeout=300s
          '''
        }
      }
    }
  }

  post {
    always {
      sh 'docker image prune -f || true'
    }
  }
}
