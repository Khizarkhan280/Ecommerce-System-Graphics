FROM gcc:latest

RUN apt-get update && apt-get install -y wget

WORKDIR /app

COPY . .

RUN mkdir -p Data

RUN g++ -std=c++11 main.cpp -o ecommerce -pthread

EXPOSE 8080

CMD ["./ecommerce"]