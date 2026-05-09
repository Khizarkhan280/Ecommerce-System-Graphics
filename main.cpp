#define CPPHTTPLIB_PATCH_SUPPORT
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define _WIN32_WINNT 0x0A01

#include "httplib.h"
#include "json.hpp"
#include <iostream>
#include <vector>
#include <string>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <cctype>
#include <map>
#include <ctime>
#include <random>

using namespace std;
using namespace httplib;
using json = nlohmann::json;

// Product class
class Product {
public:
    int productid;
    string productname;
    float productprice;
    int productqty;

    Product(int id = 0, string n = "", float p = 0, int q = 0)
        : productid(id), productname(n), productprice(p), productqty(q) {}
};

// User class
class User {
public:
    string username;
    string password;
    string email;
    string userId;
    bool isAdmin;

    User(string u = "", string p = "", string e = "", string id = "", bool admin = false)
        : username(u), password(p), email(e), userId(id), isAdmin(admin) {}
};

// Global data
vector<Product> products;
vector<User> users;
map<string, string> sessions; // token -> userId
map<string, string> tokenToUsername; // token -> username (for quick lookup)
string adminPassword = "admin123"; // in-memory password (also persisted to file)

// ─── Helpers ─────────────────────────────────────────────────────

string generateToken() {
    static const char alphanum[] = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    string token = "";
    for (int i = 0; i < 32; i++)
        token += alphanum[rand() % (sizeof(alphanum) - 1)];
    return token;
}

string generateUserId() {
    static const char alphanum[] = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    string id = "USER";
    for (int i = 0; i < 8; i++)
        id += alphanum[rand() % (sizeof(alphanum) - 1)];
    return id;
}

string getUsernameFromUserId(const string& userId) {
    for (auto& user : users) {
        if (user.userId == userId) {
            return user.username;
        }
    }
    return "Unknown User";
}

string getUsernameFromToken(const string& token) {
    if (tokenToUsername.find(token) != tokenToUsername.end()) {
        return tokenToUsername[token];
    }
    return "Unknown User";
}

bool authenticate(const Request& req, string& userId, string& username) {
    auto auth = req.get_header_value("Authorization");
    if (auth.empty() || auth.substr(0, 7) != "Bearer ") return false;
    string token = auth.substr(7);
    if (sessions.find(token) == sessions.end()) return false;
    userId = sessions[token];
    
    // Get username for this userId
    for (auto& user : users) {
        if (user.userId == userId) {
            username = user.username;
            return true;
        }
    }
    return false;
}

bool authenticate(const Request& req, string& userId) {
    auto auth = req.get_header_value("Authorization");
    if (auth.empty() || auth.substr(0, 7) != "Bearer ") return false;
    string token = auth.substr(7);
    if (sessions.find(token) == sessions.end()) return false;
    userId = sessions[token];
    return true;
}

bool isAdmin(const string& userId) {
    for (auto& user : users) {
        if (user.userId == userId && user.isAdmin) return true;
    }
    return false;
}

void setCORSHeaders(Response& res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS");
    res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

json productToJson(Product& p) {
    json j;
    j["id"]       = p.productid;
    j["name"]     = p.productname;
    j["price"]    = p.productprice;
    j["quantity"] = p.productqty;
    j["inStock"]  = (p.productqty > 0);
    return j;
}

void saveProducts() {
    ofstream outfile("Data/products.txt");
    for (auto& p : products)
        outfile << p.productid << "," << p.productname << "," << p.productprice << "," << p.productqty << "\n";
    outfile.close();
}

void saveUsers() {
    ofstream outfile("Data/users.txt");
    for (auto& u : users) {
        outfile << u.username << "," << u.password << "," << u.email << "," << u.userId << "," << u.isAdmin << "\n";
    }
    outfile.close();
}

void loadUsers() {
    ifstream file("Data/users.txt");
    if (file.is_open()) {
        string line;
        while (getline(file, line)) {
            if (line.empty()) continue;
            istringstream ss(line);
            string username, password, email, userId, isAdminStr;
            if (getline(ss, username, ',') && getline(ss, password, ',') &&
                getline(ss, email, ',') && getline(ss, userId, ',') &&
                getline(ss, isAdminStr)) {
                bool isAdmin = (isAdminStr == "1");
                users.push_back(User(username, password, email, userId, isAdmin));
            }
        }
        file.close();
    }
    
    // Create default admin if no users exist
    if (users.empty()) {
        users.push_back(User("admin", adminPassword, "admin@shop.com", "ADMIN001", true));
        saveUsers();
    }
}

void savePassword() {
    ofstream f("Data/passwords.txt");
    f << adminPassword << "\n";
    f.close();
}

// ─── Parse orders.txt into structured JSON ────────────────────────
json parseOrders() {
    json orders = json::array();
    ifstream file("Data/orders.txt");
    if (!file.is_open()) return orders;

    string line;
    json currentOrder;
    bool inOrder = false;

    while (getline(file, line)) {
        if (line.rfind("Order placed at:", 0) == 0) {
            // Start new order
            currentOrder = json::object();
            currentOrder["timestamp"] = line.substr(17);
            string& ts = currentOrder["timestamp"].get_ref<string&>();
            if (!ts.empty() && (ts.back() == '\n' || ts.back() == '\r'))
                ts.pop_back();
            currentOrder["items"] = json::array();
            currentOrder["total"] = "0";
            currentOrder["username"] = "";
            inOrder = true;
        } 
        else if (inOrder && line.rfind("User: ", 0) == 0) {
            // Extract username from "User: username"
            string username = line.substr(6);
            // Trim any trailing newline or carriage return
            while (!username.empty() && (username.back() == '\n' || username.back() == '\r' || username.back() == ' ')) {
                username.pop_back();
            }
            currentOrder["username"] = username;
        } 
        else if (inOrder && line.rfind("Total: Rs.", 0) == 0) {
            currentOrder["total"] = line.substr(10);
        } 
        else if (inOrder && line.find("----------------") != string::npos) {
            orders.push_back(currentOrder);
            inOrder = false;
        } 
        else if (inOrder && !line.empty() && line[0] == ' ') {
            // Item line: "  <name> x <qty> = Rs.<total>"
            string trimmed = line.substr(2);
            json item;
            size_t xPos = trimmed.rfind(" x ");
            size_t eqPos = trimmed.rfind(" = Rs.");
            if (xPos != string::npos && eqPos != string::npos) {
                item["name"]      = trimmed.substr(0, xPos);
                item["quantity"]  = trimmed.substr(xPos + 3, eqPos - xPos - 3);
                item["itemTotal"] = trimmed.substr(eqPos + 6);
            } else {
                item["name"] = trimmed;
                item["quantity"] = "?";
                item["itemTotal"] = "?";
            }
            currentOrder["items"].push_back(item);
        }
    }
    // In case last order had no separator
    if (inOrder && currentOrder.contains("timestamp"))
        orders.push_back(currentOrder);

    file.close();
    return orders;
}

// ─── Main ─────────────────────────────────────────────────────────

int main() {
    srand(time(0));

    cout << "========================================" << endl;
    cout << "  E-Commerce System - Web API"          << endl;
    cout << "========================================" << endl;

    // Create Data directory
    #ifdef _WIN32
        system("if not exist Data mkdir Data");
    #else
        system("mkdir -p Data");
    #endif

    // Load admin password from file (if exists)
    {
        ifstream pf("Data/passwords.txt");
        if (pf.is_open()) {
            string pw;
            if (getline(pf, pw) && !pw.empty())
                adminPassword = pw;
            pf.close();
        }
    }

    // Load users
    loadUsers();

    // Load products from file
    {
        ifstream file("Data/products.txt");
        if (file.is_open()) {
            string line;
            while (getline(file, line)) {
                if (line.empty()) continue;
                istringstream ss(line);
                string idStr, name, priceStr, qtyStr;
                if (getline(ss, idStr, ',') && getline(ss, name, ',') &&
                    getline(ss, priceStr, ',') && getline(ss, qtyStr)) {
                    products.push_back(Product(stoi(idStr), name, stof(priceStr), stoi(qtyStr)));
                }
            }
            file.close();
        }
    }

    // Add sample products if empty
    if (products.empty()) {
        products.push_back(Product(101, "Laptop",   50000, 10));
        products.push_back(Product(102, "Mouse",     1500, 50));
        products.push_back(Product(103, "Keyboard",  3000, 30));
        saveProducts();
    }

    Server svr;

    // ── CORS preflight ──────────────────────────────────────────
    svr.Options("/.*", [](const Request& req, Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    });

    // ── GET /api/products ───────────────────────────────────────
    svr.Get("/api/products", [](const Request& req, Response& res) {
        json arr = json::array();
        for (auto& p : products) arr.push_back(productToJson(p));
        setCORSHeaders(res);
        res.set_content(arr.dump(), "application/json");
    });

    // ── POST /api/register (User Registration) ───────────────────
    svr.Post("/api/register", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        try {
            auto body = json::parse(req.body);
            string username = body["username"];
            string password = body["password"];
            string email = body["email"];
            
            // Check if username already exists
            for (auto& u : users) {
                if (u.username == username) {
                    res.set_content(json{{"success",false},{"message","Username already exists"}}.dump(), "application/json");
                    return;
                }
            }
            
            if (username.length() < 3) {
                res.set_content(json{{"success",false},{"message","Username must be at least 3 characters"}}.dump(), "application/json");
                return;
            }
            
            if (password.length() < 6) {
                res.set_content(json{{"success",false},{"message","Password must be at least 6 characters"}}.dump(), "application/json");
                return;
            }
            
            string userId = generateUserId();
            users.push_back(User(username, password, email, userId, false));
            saveUsers();
            
            res.set_content(json{{"success",true},{"message","Registration successful! Please login."}}.dump(), "application/json");
        } catch (...) {
            res.set_content(json{{"success",false},{"message","Invalid request body"}}.dump(), "application/json");
        }
    });
    
    // ── POST /api/login (User Login) ─────────────────────────────
    svr.Post("/api/login", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        try {
            auto body = json::parse(req.body);
            string username = body["username"];
            string password = body["password"];
            
            for (auto& user : users) {
                if (user.username == username && user.password == password) {
                    string token = generateToken();
                    sessions[token] = user.userId;
                    tokenToUsername[token] = user.username; // Store username with token
                    res.set_content(json{
                        {"success",true},
                        {"token",token},
                        {"username",user.username},
                        {"userId",user.userId},
                        {"isAdmin",user.isAdmin},
                        {"message","Login successful"}
                    }.dump(), "application/json");
                    return;
                }
            }
            
            res.set_content(json{{"success",false},{"message","Invalid username or password"}}.dump(), "application/json");
        } catch (...) {
            res.set_content(json{{"success",false},{"message","Invalid request"}}.dump(), "application/json");
        }
    });

    // ── POST /api/admin/login (Admin Login) ──────────────────────
    svr.Post("/api/admin/login", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        try {
            auto body = json::parse(req.body);
            string password = body["password"];
            if (password == adminPassword) {
                string token = generateToken();
                sessions[token] = "ADMIN001";
                tokenToUsername[token] = "Admin";
                res.set_content(json{
                    {"success",true}, {"token",token},
                    {"isAdmin",true}, {"message","Admin login successful"}
                }.dump(), "application/json");
            } else {
                res.set_content(json{{"success",false},{"message","Invalid password"}}.dump(), "application/json");
            }
        } catch (...) {
            res.set_content(json{{"success",false},{"message","Invalid request"}}.dump(), "application/json");
        }
    });

    // ── POST /api/products (Admin) ──────────────────────────────
    svr.Post("/api/products", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        string userId;
        if (!authenticate(req, userId) || !isAdmin(userId)) {
            res.set_content(json{{"success",false},{"message","Admin access required"}}.dump(), "application/json");
            return;
        }
        try {
            auto body = json::parse(req.body);
            products.push_back(Product(body["id"], body["name"], body["price"].get<float>(), body["quantity"]));
            saveProducts();
            res.set_content(json{{"success",true},{"message","Product added"}}.dump(), "application/json");
        } catch (...) {
            res.set_content(json{{"success",false},{"message","Invalid request body"}}.dump(), "application/json");
        }
    });

    // ── DELETE /api/products/:id (Admin) ────────────────────────
    svr.Delete("/api/products/:id", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        string userId;
        if (!authenticate(req, userId) || !isAdmin(userId)) {
            res.set_content(json{{"success",false},{"message","Admin access required"}}.dump(), "application/json");
            return;
        }
        int id = stoi(req.path_params.at("id"));
        for (size_t i = 0; i < products.size(); i++) {
            if (products[i].productid == id) {
                products.erase(products.begin() + i);
                saveProducts();
                res.set_content(json{{"success",true},{"message","Product deleted"}}.dump(), "application/json");
                return;
            }
        }
        res.set_content(json{{"success",false},{"message","Product not found"}}.dump(), "application/json");
    });

    // ── PATCH /api/products/:id/stock (Admin) ───────────────────
    svr.Patch("/api/products/:id/stock", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        string userId;
        if (!authenticate(req, userId) || !isAdmin(userId)) {
            res.set_content(json{{"success",false},{"message","Admin access required"}}.dump(), "application/json");
            return;
        }
        
        int id = stoi(req.path_params.at("id"));
        int delta;
        
        try {
            auto body = json::parse(req.body);
            delta = body["delta"].get<int>();
        } catch (...) {
            res.set_content(json{{"success",false},{"message","Invalid request body"}}.dump(), "application/json");
            return;
        }
        
        for (auto& p : products) {
            if (p.productid == id) {
                int newQty = p.productqty + delta;
                if (newQty < 0) {
                    res.set_content(json{{"success",false},{"message","Stock cannot be negative"}}.dump(), "application/json");
                    return;
                }
                p.productqty = newQty;
                saveProducts();
                res.set_content(json{
                    {"success",true},
                    {"message", string(delta > 0 ? "Stock increased" : "Stock decreased")},
                    {"newQuantity", newQty}
                }.dump(), "application/json");
                return;
            }
        }
        
        res.set_content(json{{"success",false},{"message","Product not found"}}.dump(), "application/json");
    });

    // ── POST /api/admin/password (Change password) ───────────────
    svr.Post("/api/admin/password", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        string userId;
        if (!authenticate(req, userId) || !isAdmin(userId)) {
            res.set_content(json{{"success",false},{"message","Admin access required"}}.dump(), "application/json");
            return;
        }
        try {
            auto body = json::parse(req.body);
            string currentPw = body["currentPassword"];
            string newPw     = body["newPassword"];

            if (currentPw != adminPassword) {
                res.set_content(json{{"success",false},{"message","Current password is incorrect"}}.dump(), "application/json");
                return;
            }
            if (newPw.size() < 6) {
                res.set_content(json{{"success",false},{"message","Password must be at least 6 characters"}}.dump(), "application/json");
                return;
            }
            adminPassword = newPw;
            savePassword();
            res.set_content(json{{"success",true},{"message","Password updated successfully"}}.dump(), "application/json");
        } catch (...) {
            res.set_content(json{{"success",false},{"message","Invalid request body"}}.dump(), "application/json");
        }
    });

    // ── POST /api/logout ─────────────────────────────────────────
    svr.Post("/api/logout", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        auto auth = req.get_header_value("Authorization");
        if (auth.size() > 7 && auth.substr(0, 7) == "Bearer ") {
            string token = auth.substr(7);
            sessions.erase(token);
            tokenToUsername.erase(token);
        }
        res.set_content(json{{"success",true}}.dump(), "application/json");
    });

    // ── POST /api/checkout (Requires authentication) ─────────────
    svr.Post("/api/checkout", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        
        // Check if user is authenticated and get username
        string userId;
        string username;
        auto auth = req.get_header_value("Authorization");
        if (auth.empty() || auth.substr(0, 7) != "Bearer ") {
            res.set_content(json{{"success",false},{"message","Please login to place order","requiresLogin",true}}.dump(), "application/json");
            return;
        }
        
        string token = auth.substr(7);
        if (sessions.find(token) == sessions.end()) {
            res.set_content(json{{"success",false},{"message","Please login to place order","requiresLogin",true}}.dump(), "application/json");
            return;
        }
        
        userId = sessions[token];
        
        // Get username from token
        if (tokenToUsername.find(token) != tokenToUsername.end()) {
            username = tokenToUsername[token];
        } else {
            username = getUsernameFromUserId(userId);
        }
        
        cout << "Checkout - User: " << username << ", UserId: " << userId << endl;
        
        try {
            auto body  = json::parse(req.body);
            json items = body["items"];
            float total = body["total"].get<float>();

            ofstream file("Data/orders.txt", ios::app);
            if (file.is_open()) {
                time_t now = time(0);
                file << "Order placed at: " << ctime(&now);
                file << "User: " << username << "\n";  // Store username with order
                for (auto& item : items) {
                    float itemTotal = item["price"].get<float>() * item["quantity"].get<int>();
                    file << "  " << item["name"].get<string>()
                         << " x " << item["quantity"].get<int>()
                         << " = Rs." << itemTotal << "\n";
                    // Update stock
                    for (auto& p : products) {
                        if (p.productid == item["id"].get<int>()) {
                            p.productqty -= item["quantity"].get<int>();
                            break;
                        }
                    }
                }
                file << "Total: Rs." << total << "\n";
                file << "----------------\n";
                file.close();
                saveProducts();
            }
            res.set_content(json{{"success",true},{"message","Order placed successfully!"}}.dump(), "application/json");
        } catch (const exception& e) {
            cout << "Checkout error: " << e.what() << endl;
            res.set_content(json{{"success",false},{"message","Checkout failed: " + string(e.what())}}.dump(), "application/json");
        } catch (...) {
            res.set_content(json{{"success",false},{"message","Checkout failed"}}.dump(), "application/json");
        }
    });

    // ── GET /api/orders (Admin) ──────────────────────────────────
    svr.Get("/api/orders", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        string userId;
        if (!authenticate(req, userId) || !isAdmin(userId)) {
            res.set_content(json{{"success",false},{"message","Admin access required"}}.dump(), "application/json");
            return;
        }
        json orders = parseOrders();
        res.set_content(json{{"success",true},{"orders",orders}}.dump(), "application/json");
    });

    // ── DELETE /api/orders (Admin — clear all) ───────────────────
    svr.Delete("/api/orders", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        string userId;
        if (!authenticate(req, userId) || !isAdmin(userId)) {
            res.set_content(json{{"success",false},{"message","Admin access required"}}.dump(), "application/json");
            return;
        }
        ofstream file("Data/orders.txt", ios::trunc);
        file.close();
        res.set_content(json{{"success",true},{"message","All orders cleared"}}.dump(), "application/json");
    });

    // ── GET /api/user (Get current user info) ────────────────────
    svr.Get("/api/user", [](const Request& req, Response& res) {
        setCORSHeaders(res);
        string userId;
        if (!authenticate(req, userId)) {
            res.set_content(json{{"success",false},{"message","Not authenticated"}}.dump(), "application/json");
            return;
        }
        
        for (auto& user : users) {
            if (user.userId == userId) {
                res.set_content(json{
                    {"success",true},
                    {"username",user.username},
                    {"email",user.email},
                    {"isAdmin",user.isAdmin}
                }.dump(), "application/json");
                return;
            }
        }
        
        res.set_content(json{{"success",false},{"message","User not found"}}.dump(), "application/json");
    });

    // ── Serve frontend ───────────────────────────────────────────
    svr.set_mount_point("/", "./frontend");

    cout << "\n========================================" << endl;
    cout << "  Server is running!"                      << endl;
    cout << "  Open: http://localhost:8080"             << endl;
    cout << "  Admin Password: " << adminPassword       << endl;
    cout << "  Press Ctrl+C to stop"                    << endl;
    cout << "========================================" << endl;

    svr.listen("0.0.0.0", 8080);
    return 0;
}