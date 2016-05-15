#!/bin/bash

# Exit on any error
set -e

$GCLOUD docker push eu.gcr.io/${GCLOUD_PROJECT}/frontend
sudo chown -R ubuntu:ubuntu /home/ubuntu/.kube
kubectl patch deployment kbh-billeder-staging -p '{"spec":{"template":{"spec":{"containers":[{"name":"frontend","image":"eu.gcr.io/'"$GCLOUD_PROJECT"'/frontend:'"$CIRCLE_SHA1"'"}]}}}}'
