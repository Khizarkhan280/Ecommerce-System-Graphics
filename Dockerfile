FROM gcc:latest

WORKDIR /app

COPY . .

RUN g++ -std=c++11 main.cpp Models/*.cpp Services/*.cpp Utils/*.cpp -I. -lws2_32 -pthread -o ecommerce

EXPOSE 8080

CMD ["./ecommerce"]