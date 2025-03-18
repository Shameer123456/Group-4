CREATE DATABASE IF NOT EXISTS PropertyManagement;

USE PropertyManagement;

CREATE TABLE Users (
    Username VARCHAR(50) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    Role ENUM('admin', 'agent') NOT NULL DEFAULT 'agent'
);

CREATE TABLE Tenants (
    TenantID INT PRIMARY KEY AUTO_INCREMENT,
    FirstName VARCHAR(50) NOT NULL,
    LastName VARCHAR(50) NOT NULL,
    HouseNo VARCHAR(10) NOT NULL,
    AddressLine1 VARCHAR(100) NOT NULL,
    City VARCHAR(50) NOT NULL,
    PostCode VARCHAR(10) NOT NULL,
    PhoneNumber VARCHAR(15),
    Email VARCHAR(100),
    Notes TEXT
);

CREATE TABLE Landlords (
    LandlordID INT PRIMARY KEY AUTO_INCREMENT,
    FirstName VARCHAR(50) NOT NULL,
    LastName VARCHAR(50) NOT NULL,
    Address VARCHAR(100) NOT NULL,
    PhoneNumber VARCHAR(15),
    Email VARCHAR(100),
    Notes TEXT
);

CREATE TABLE Properties (
    PropertyID INT PRIMARY KEY AUTO_INCREMENT,
    LandlordID INT,
    TenantID INT NULL,  
    AddressLine1 VARCHAR(100) NOT NULL,
    City VARCHAR(50) NOT NULL,
    PostCode VARCHAR(10) NOT NULL,
    RentAmount DECIMAL(10,2) NOT NULL,
    GasCertExpiry DATE,
    EPCExpiry DATE,
    EICRExpiry DATE,
    EPCRating CHAR(1) CHECK (EPCRating IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')),
    Notes TEXT,  
    CONSTRAINT FK_Landlord FOREIGN KEY (LandlordID) REFERENCES Landlords(LandlordID) ON DELETE CASCADE,
    CONSTRAINT FK_Tenant FOREIGN KEY (TenantID) REFERENCES Tenants(TenantID) ON DELETE SET NULL
);

CREATE TABLE Maintenance (
    MaintenanceID INT PRIMARY KEY AUTO_INCREMENT,
    PropertyID INT,
    Description VARCHAR(255) NOT NULL,
    Status VARCHAR(50) CHECK (Status IN ('Pending', 'Completed', 'In Progress')),
    DateReported DATE NOT NULL,
    DateCompleted DATE,
    CONSTRAINT FK_Property FOREIGN KEY (PropertyID) REFERENCES Properties(PropertyID) ON DELETE CASCADE
);

CREATE TABLE QuickLinks (
    QuickLinkID INT PRIMARY KEY AUTO_INCREMENT,
    Name VARCHAR(100) NOT NULL,
    URL VARCHAR(255) NOT NULL
);
