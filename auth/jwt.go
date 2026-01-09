package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// JWTSecret is the secret key used to sign JWT tokens.
// In a production environment, this should be loaded from a secure configuration.
// var JWTSecret = []byte(GenerateSecureKey(64))

var JWTSecret = []byte("kjadshasd97sd!@%#^")

// TokenExpiration is the duration for which a JWT token is valid.
const TokenExpiration = 24 * time.Hour

// TokenBlacklistChecker is a function type for checking if a token is blacklisted
type TokenBlacklistChecker func(token string) bool

// BlacklistChecker is set by the models package to check blacklisted tokens
var BlacklistChecker TokenBlacklistChecker

// TokenBlacklister is a function type for blacklisting a token
type TokenBlacklister func(token string, expiresAt time.Time) error

// Blacklister is set by the models package to blacklist tokens
var Blacklister TokenBlacklister

// Claims defines the custom claims for the JWT.
type Claims struct {
	UserId   int64  `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// GenerateToken creates a new JWT token for a given user.
func GenerateToken(userId int64, username string, role string) (string, error) {
	expirationTime := time.Now().Add(TokenExpiration)
	claims := &Claims{
		UserId:   userId,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(JWTSecret)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// ValidateToken parses and validates a JWT token string, returning the user ID if valid.
func ValidateToken(tokenString string) (int64, error) {
	// Check if token is blacklisted
	if BlacklistChecker != nil && BlacklistChecker(tokenString) {
		return 0, errors.New("token has been invalidated")
	}

	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return JWTSecret, nil
	})

	if err != nil {
		return 0, err
	}

	if !token.Valid {
		return 0, errors.New("invalid token")
	}

	return claims.UserId, nil
}

// InvalidateToken adds a token to the blacklist
func InvalidateToken(tokenString string) error {
	if Blacklister == nil {
		return errors.New("blacklister not configured")
	}

	// Parse the token to get expiry time
	claims := &Claims{}
	jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return JWTSecret, nil
	})

	// Use current time + TokenExpiration if we can't parse expiry
	expiresAt := time.Now().Add(TokenExpiration)
	if claims.ExpiresAt != nil {
		expiresAt = claims.ExpiresAt.Time
	}

	return Blacklister(tokenString, expiresAt)
}
