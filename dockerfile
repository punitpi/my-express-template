FROM node:lts-alpine3.15
RUN apk add dumb-init
ENV NODE_ENV production

WORKDIR /application
COPY ./package.json /application/
COPY ./package-lock.json /application/
RUN npm run build-prod
COPY ./ /application/

USER node
EXPOSE 3000

CMD ["dumb-init", "npm", "run", "start"]