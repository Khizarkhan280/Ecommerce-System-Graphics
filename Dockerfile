FROM gcc:latest

RUN apt-get update && apt-get install -y wget

WORKDIR /app

# Copy all files
COPY . .

# Create necessary directories
RUN mkdir -p Data# Compile only main.cpp (all headers are included in main.cpp)
RUN g++ -std=c++11 main.cpp -o ecommerce -lws2_32 -pthread

EXPOSE 8080

CMD ["./ecommerce"]