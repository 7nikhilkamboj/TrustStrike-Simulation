package logger

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/sirupsen/logrus"
)

// Logger is the main logger that is abstracted in this package.
// It is exported here for use with gorm.
var Logger *logrus.Logger

// ErrInvalidLevel is returned when an invalid log level is given in the config
var ErrInvalidLevel = errors.New("invalid log level")

// Config represents configuration details for logging.
type Config struct {
	Filename string `json:"filename"`
	Level    string `json:"level"`
}

func init() {
	Logger = logrus.New()
	Logger.Formatter = &SimpleFormatter{}
}

// SimpleFormatter is a custom formatter that outputs [LEVEL] message
type SimpleFormatter struct{}

func (f *SimpleFormatter) Format(entry *logrus.Entry) ([]byte, error) {
	level := strings.ToUpper(entry.Level.String())
	return []byte(fmt.Sprintf("[%s] %s\n", level, entry.Message)), nil
}

// Setup configures the logger based on options in the config.json.
func Setup(config *Config) error {
	var err error
	// Set up logging level
	level := logrus.InfoLevel
	if config.Level != "" {
		level, err = logrus.ParseLevel(config.Level)
		if err != nil {
			return err
		}
	}
	Logger.SetLevel(level)
	// Set up logging to a file if specified in the config
	logFile := config.Filename
	if logFile != "" {
		f, err := os.OpenFile(logFile, os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0644)
		if err != nil {
			return err
		}
		mw := io.MultiWriter(os.Stderr, f)
		Logger.Out = mw
	}
	return nil
}

// Debug logs a debug message
func Debug(args ...interface{}) {
	Logger.Debug(args...)
}

// Debugf logs a formatted debug messsage
func Debugf(format string, args ...interface{}) {
	Logger.Debugf(format, args...)
}

// Info logs an informational message
func Info(args ...interface{}) {
	Logger.Info(args...)
}

// Infof logs a formatted informational message
func Infof(format string, args ...interface{}) {
	Logger.Infof(format, args...)
}

// Error logs an error message
func Error(args ...interface{}) {
	Logger.Error(args...)
}

// Errorf logs a formatted error message
func Errorf(format string, args ...interface{}) {
	Logger.Errorf(format, args...)
}

// Warn logs a warning message
func Warn(args ...interface{}) {
	Logger.Warn(args...)
}

// Warnf logs a formatted warning message
func Warnf(format string, args ...interface{}) {
	Logger.Warnf(format, args...)
}

// Fatal logs a fatal error message
func Fatal(args ...interface{}) {
	Logger.Fatal(args...)
}

// Fatalf logs a formatted fatal error message
func Fatalf(format string, args ...interface{}) {
	Logger.Fatalf(format, args...)
}

// WithFields returns a new log enty with the provided fields
func WithFields(fields logrus.Fields) *logrus.Entry {
	return Logger.WithFields(fields)
}

// Writer returns the current logging writer
func Writer() *io.PipeWriter {
	return Logger.Writer()
}

// SimpleLoggingHandler returns an http.Handler that logs requests in simple format
func SimpleLoggingHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Create a response writer wrapper to capture status code
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rw, r)
		Logger.Infof("%s %s → %d", r.Method, r.URL.Path, rw.statusCode)
	})
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}
