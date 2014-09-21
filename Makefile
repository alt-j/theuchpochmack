NPM_BIN = node_modules/.bin
ENB = $(NPM_BIN)/enb

all: npm build

.PHONY: npm
npm::
	@npm install

.PHONY: lint
lint::
	@$(NPM_BIN)/jshint-groups
	@$(NPM_BIN)/jscs .

.PHONY: build
build:
	YENV=$(YENV) $(ENB) make

.PHONY: dev
dev:
	@$(NPM_BIN)/supervisor -w blocks -- server/app.js

.PHONY: clean
clean:
	$(ENB) make clean
