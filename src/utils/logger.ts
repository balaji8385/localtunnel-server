import winston from 'winston';

function createLogger(): winston.Logger {
    const logFormat = winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} [${level}]: ${message}`;
    });

    return winston.createLogger({
        level: 'info', // default log level
        format: winston.format.combine(
            winston.format.timestamp(),
            logFormat
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }),
            new winston.transports.File({ filename: 'logs/app.log' })
        ]
    });
}

const logger = createLogger();

export default logger;
