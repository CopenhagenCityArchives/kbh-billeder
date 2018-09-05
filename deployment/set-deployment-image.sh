#!/usr/bin/env bash

# Exit on any error, be verbose.
set -xe

# Update the image used by the frontend deployment for the environment.
kubectl set image deployment/frontend -n $NAMESPACE frontend=$IMAGE_PATH
