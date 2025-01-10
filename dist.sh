#!/usr/bin/env bash

DIR=$(realpath ${0%/*})
cd $DIR
eval $(mise env)
set -ex

./build.sh
cd packages/protoscript/
npm version patch
git add -u
git commit -mver
git push
npm publish --access=public
